import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  const ApiException(this.message, {this.code, this.statusCode});
  final String message;
  final String? code;
  final int? statusCode;
  @override
  String toString() => message;
}

class NetworkUnavailable implements Exception {
  const NetworkUnavailable();
}

class ApiClient {
  ApiClient(
    this._storage, {
    http.Client? client,
    List<Duration>? loginRetryDelays,
  }) : _client = client ?? http.Client(),
       _loginRetryDelays =
           loginRetryDelays ??
           const [Duration(milliseconds: 700), Duration(seconds: 2)];

  final FlutterSecureStorage _storage;
  final http.Client _client;
  final List<Duration> _loginRetryDelays;
  static const _accessKey = 'frequencia_itb_access_token';
  static const _refreshKey = 'frequencia_itb_refresh_token';
  static const baseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://127.0.0.1:8787',
  );

  Future<Map<String, dynamic>> login(String email, String password) async {
    for (var attempt = 0; ; attempt++) {
      try {
        final response = await _raw(
          'POST',
          '/auth/login',
          body: {'email': email.trim().toLowerCase(), 'password': password},
          authenticated: false,
        );
        await _saveTokens(response);
        return response;
      } on ApiException catch (exception) {
        final canRetry =
            attempt < _loginRetryDelays.length &&
            _isTemporaryServerFailure(exception.statusCode);
        if (!canRetry) rethrow;
        await Future<void>.delayed(_loginRetryDelays[attempt]);
      }
    }
  }

  Future<void> logout() async {
    final refresh = await _storage.read(key: _refreshKey);
    try {
      if (refresh != null) {
        await post('/auth/logout', {'refreshToken': refresh});
      }
    } finally {
      await clearTokens();
    }
  }

  Future<bool> hasPersistedSession() async =>
      await _storage.read(key: _refreshKey) != null;

  Future<Map<String, dynamic>?> restoreSession() async {
    final token = await _storage.read(key: _refreshKey);
    if (token == null) return null;
    try {
      final result = await _raw(
        'POST',
        '/auth/refresh',
        body: {'refreshToken': token},
        authenticated: false,
        mayRefresh: false,
      );
      await _saveTokens(result);
      return result;
    } on ApiException catch (exception) {
      if (exception.statusCode != 401) rethrow;
      await clearTokens();
      return null;
    }
  }

  Future<Map<String, dynamic>> get(String path) => _raw('GET', path);
  Future<Map<String, dynamic>> post(String path, Object body) =>
      _raw('POST', path, body: body);
  Future<Map<String, dynamic>> put(String path, Object body) =>
      _raw('PUT', path, body: body);
  Future<Map<String, dynamic>> patch(String path, Object body) =>
      _raw('PATCH', path, body: body);
  Future<Map<String, dynamic>> delete(String path) => _raw('DELETE', path);

  Future<Map<String, dynamic>> _raw(
    String method,
    String path, {
    Object? body,
    bool authenticated = true,
    bool mayRefresh = true,
  }) async {
    try {
      final headers = <String, String>{'content-type': 'application/json'};
      if (authenticated) {
        final access = await _storage.read(key: _accessKey);
        if (access != null) headers['authorization'] = 'Bearer $access';
      }
      final uri = Uri.parse('$baseUrl$path');
      final request = http.Request(method, uri)..headers.addAll(headers);
      if (body != null) request.body = jsonEncode(body);
      final streamed = await _client
          .send(request)
          .timeout(const Duration(seconds: 12));
      final response = await http.Response.fromStream(streamed);
      if (response.statusCode == 401 &&
          authenticated &&
          mayRefresh &&
          await _refresh()) {
        return _raw(method, path, body: body, mayRefresh: false);
      }
      final decoded = _decodeResponse(response);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final error = decoded['error'] as Map<String, dynamic>?;
        throw ApiException(
          error?['message'] as String? ??
              _messageForStatus(response.statusCode),
          code: error?['code'] as String?,
          statusCode: response.statusCode,
        );
      }
      return decoded;
    } on ApiException {
      rethrow;
    } on SocketException {
      throw const NetworkUnavailable();
    } on TimeoutException {
      throw const NetworkUnavailable();
    } on http.ClientException {
      throw const NetworkUnavailable();
    } on HttpException {
      throw const NetworkUnavailable();
    } on HandshakeException {
      throw const NetworkUnavailable();
    } on TlsException {
      throw const NetworkUnavailable();
    } on IOException {
      throw const NetworkUnavailable();
    }
  }

  Map<String, dynamic> _decodeResponse(http.Response response) {
    if (response.bodyBytes.isEmpty) return <String, dynamic>{};
    try {
      final value = jsonDecode(utf8.decode(response.bodyBytes));
      if (value is Map<String, dynamic>) return value;
    } on FormatException {
      // Proxies such as Cloudflare can return plain text or HTML during a
      // temporary outage. The HTTP status below remains the useful signal.
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return <String, dynamic>{};
    }
    throw ApiException(
      'O servidor retornou uma resposta inválida.',
      code: 'INVALID_RESPONSE',
      statusCode: response.statusCode,
    );
  }

  bool _isTemporaryServerFailure(int? statusCode) =>
      statusCode == 502 || statusCode == 503 || statusCode == 504;

  String _messageForStatus(int statusCode) {
    if (_isTemporaryServerFailure(statusCode)) {
      return 'O servidor está temporariamente sobrecarregado. Tente novamente em alguns instantes.';
    }
    return 'Falha na comunicação com o servidor.';
  }

  Future<bool> _refresh() async {
    return await restoreSession() != null;
  }

  Future<void> _saveTokens(Map<String, dynamic> result) async {
    final access = result['accessToken'] as String?;
    final refresh = result['refreshToken'] as String?;
    if (access == null || refresh == null) {
      throw const ApiException('Resposta de autenticação inválida.');
    }
    await _storage.write(key: _accessKey, value: access);
    await _storage.write(key: _refreshKey, value: refresh);
  }

  Future<void> clearTokens() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }
}
