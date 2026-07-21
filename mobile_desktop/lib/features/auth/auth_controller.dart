import 'dart:async';
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
  int _sessionRevision = 0;
  Future<void>? _restoration;

  Future<void> restoreSession() async {
    final cached = _database.cachedSession();
    if (cached == null) return;
    if (!await _api.hasPersistedSession()) return;
    try {
      session = UserSession.fromJson(cached);
      offline = true;
      notifyListeners();
      final revision = ++_sessionRevision;
      final validation = _validateRestoredSession(cached, revision);
      _restoration = validation;
      unawaited(
        validation.whenComplete(() {
          if (identical(_restoration, validation)) _restoration = null;
        }),
      );
    } catch (exception, stackTrace) {
      debugPrint('Falha ao ler a sessão salva: $exception\n$stackTrace');
      await _api.clearTokens();
    }
  }

  Future<void> _validateRestoredSession(
    Map<String, dynamic> cached,
    int revision,
  ) async {
    try {
      final restored = await _api.restoreSession();
      if (revision != _sessionRevision) return;
      if (restored == null) {
        session = null;
        offline = false;
        return;
      }
      final user = restored['user'] as Map<String, dynamic>? ?? cached;
      session = UserSession.fromJson(user);
      _database.saveSession(session!.toJson());
      offline = false;
      unawaited(_sync.synchronize());
    } on NetworkUnavailable {
      if (revision != _sessionRevision) return;
      session = UserSession.fromJson(cached);
      offline = true;
    } on ApiException catch (exception) {
      if (revision != _sessionRevision) return;
      if ((exception.statusCode ?? 0) >= 500) {
        session = UserSession.fromJson(cached);
        offline = true;
      } else {
        await _api.clearTokens();
        session = null;
        offline = false;
      }
    } catch (exception, stackTrace) {
      if (revision != _sessionRevision) return;
      debugPrint('Falha ao restaurar a sessão: $exception\n$stackTrace');
      await _api.clearTokens();
      session = null;
      offline = false;
    } finally {
      if (revision == _sessionRevision) notifyListeners();
    }
  }

  Future<bool> login(String email, String password) async {
    final restoration = _restoration;
    _sessionRevision++;
    if (restoration != null) await restoration;
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
    final restoration = _restoration;
    _sessionRevision++;
    if (restoration != null) await restoration;
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
