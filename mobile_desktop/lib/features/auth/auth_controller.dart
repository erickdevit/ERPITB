import 'dart:convert';
import 'dart:math';

import 'package:cryptography/cryptography.dart';
import 'package:flutter/foundation.dart';

import '../../core/database/local_database.dart';
import '../../core/models/models.dart';
import '../../core/network/api_client.dart';
import '../../core/sync/sync_service.dart';

class AuthController extends ChangeNotifier {
  AuthController(this._database, this._api, this._sync);

  final LocalDatabase _database;
  final ApiClient _api;
  final SyncService _sync;
  UserSession? session;
  bool loading = false;
  bool offline = false;
  String? error;

  Future<bool> login(String email, String password) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final result = await _api.login(email.trim().toLowerCase(), password);
      session = UserSession.fromJson(result['user'] as Map<String, dynamic>);
      _database.saveSession(session!.toJson());
      await _cacheVerifier(session!, password);
      offline = false;
      await _sync.synchronize();
      return true;
    } on NetworkUnavailable {
      final accepted = await _offlineLogin(email, password);
      if (!accepted) {
        error =
            'Primeiro acesso requer internet ou as credenciais locais não conferem.';
      }
      return accepted;
    } on ApiException catch (exception) {
      error = exception.message;
      return false;
    } catch (exception, stackTrace) {
      debugPrint('Falha inesperada durante o login: $exception\n$stackTrace');
      error = 'Não foi possível concluir o login neste dispositivo.';
      return false;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    if (!offline) {
      try {
        await _api.logout();
      } catch (_) {
        await _api.clearTokens();
      }
    } else {
      await _api.clearTokens();
    }
    session = null;
    offline = false;
    notifyListeners();
  }

  Future<void> _cacheVerifier(UserSession user, String password) async {
    final salt = List<int>.generate(16, (_) => Random.secure().nextInt(256));
    final algorithm = Argon2id(
      parallelism: 1,
      memory: 19 * 1024,
      iterations: 2,
      hashLength: 32,
    );
    final key = await algorithm.deriveKeyFromPassword(
      password: password,
      nonce: salt,
    );
    final verifier = await key.extractBytes();
    _database.saveOfflineVerifier(
      userId: user.id,
      email: user.email,
      salt: base64Encode(salt),
      verifier: base64Encode(verifier),
    );
  }

  Future<bool> _offlineLogin(String email, String password) async {
    final stored = _database.offlineVerifier(email.trim().toLowerCase());
    final cached = _database.cachedSession();
    if (stored == null || cached == null || stored['user_id'] != cached['id']) {
      return false;
    }
    final algorithm = Argon2id(
      parallelism: 1,
      memory: 19 * 1024,
      iterations: 2,
      hashLength: 32,
    );
    final key = await algorithm.deriveKeyFromPassword(
      password: password,
      nonce: base64Decode(stored['salt']! as String),
    );
    final actual = await key.extractBytes();
    final expected = base64Decode(stored['verifier']! as String);
    if (!_constantTimeEquals(actual, expected)) return false;
    session = UserSession.fromJson(cached);
    offline = true;
    return true;
  }

  bool _constantTimeEquals(List<int> left, List<int> right) {
    if (left.length != right.length) return false;
    var difference = 0;
    for (var index = 0; index < left.length; index++) {
      difference |= left[index] ^ right[index];
    }
    return difference == 0;
  }
}
