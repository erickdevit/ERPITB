import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:frequencia_itb/core/database/local_database.dart';
import 'package:frequencia_itb/core/models/models.dart';
import 'package:frequencia_itb/core/network/api_client.dart';
import 'package:frequencia_itb/core/sync/sync_service.dart';
import 'package:frequencia_itb/features/auth/auth_controller.dart';

void main() {
  const user = UserSession(
    id: 'admin-session',
    name: 'Administrador',
    email: 'admin@itb.org.br',
    role: UserRole.admin,
  );

  test('restores a persisted session and renews its tokens', () async {
    final database = LocalDatabase.inMemory();
    await database.initialize();
    addTearDown(database.dispose);
    database.saveSession(user.toJson());
    final api = _SessionApi(restoredUser: user);
    final auth = AuthController(database, api, SyncService(database, api));

    await auth.restoreSession();
    expect(auth.session?.id, user.id);
    expect(auth.offline, isTrue);

    await pumpEventQueue();
    expect(auth.session?.id, user.id);
    expect(auth.offline, isFalse);
    expect(api.restoreCalls, 1);
  });

  test(
    'keeps the restored session available when startup is offline',
    () async {
      final database = LocalDatabase.inMemory();
      await database.initialize();
      addTearDown(database.dispose);
      database.saveSession(user.toJson());
      final api = _SessionApi(networkUnavailable: true);
      final auth = AuthController(database, api, SyncService(database, api));

      await auth.restoreSession();
      await pumpEventQueue();

      expect(auth.session?.id, user.id);
      expect(auth.offline, isTrue);
      expect(database.cachedSession()?['id'], user.id);
    },
  );

  test(
    'expired session is removed and explicit logout prevents restoration',
    () async {
      final database = LocalDatabase.inMemory();
      await database.initialize();
      addTearDown(database.dispose);
      database.saveSession(user.toJson());
      final expiredApi = _SessionApi(restoredUser: null);
      final expiredAuth = AuthController(
        database,
        expiredApi,
        SyncService(database, expiredApi),
      );

      await expiredAuth.restoreSession();
      await pumpEventQueue();
      expect(expiredAuth.session, isNull);
      expect(expiredApi.persisted, isFalse);

      database.saveSession(user.toJson());
      final activeApi = _SessionApi(restoredUser: user);
      final activeAuth = AuthController(
        database,
        activeApi,
        SyncService(database, activeApi),
      )..session = user;
      await activeAuth.logout();

      expect(activeAuth.session, isNull);
      expect(activeApi.persisted, isFalse);
      await activeAuth.restoreSession();
      expect(activeAuth.session, isNull);
    },
  );

  test('logout cannot be undone by an in-flight startup renewal', () async {
    final database = LocalDatabase.inMemory();
    await database.initialize();
    addTearDown(database.dispose);
    database.saveSession(user.toJson());
    final renewal = Completer<Map<String, dynamic>?>();
    final api = _SessionApi(renewal: renewal);
    final auth = AuthController(database, api, SyncService(database, api));

    await auth.restoreSession();
    expect(auth.session?.id, user.id);
    final logout = auth.logout();
    await pumpEventQueue();
    renewal.complete({
      'user': user.toJson(),
      'accessToken': 'late-access-token',
      'refreshToken': 'late-refresh-token',
    });
    await logout;
    await pumpEventQueue();

    expect(auth.session, isNull);
    expect(api.persisted, isFalse);
  });
}

class _SessionApi extends ApiClient {
  _SessionApi({
    this.restoredUser,
    this.networkUnavailable = false,
    this.renewal,
  }) : super(const FlutterSecureStorage());

  final UserSession? restoredUser;
  final bool networkUnavailable;
  final Completer<Map<String, dynamic>?>? renewal;
  bool persisted = true;
  int restoreCalls = 0;

  @override
  Future<bool> hasPersistedSession() async => persisted;

  @override
  Future<Map<String, dynamic>?> restoreSession() async {
    restoreCalls++;
    if (renewal != null) return renewal!.future;
    if (networkUnavailable) throw const NetworkUnavailable();
    if (restoredUser == null) {
      persisted = false;
      return null;
    }
    return {
      'user': restoredUser!.toJson(),
      'accessToken': 'new-access-token',
      'refreshToken': 'new-refresh-token',
    };
  }

  @override
  Future<void> logout() async => persisted = false;

  @override
  Future<void> clearTokens() async => persisted = false;

  @override
  Future<Map<String, dynamic>> get(String path) async => {
    'changes': <Object>[],
    'nextCursor': 0,
    'hasMore': false,
  };

  @override
  Future<Map<String, dynamic>> post(String path, Object body) async => {
    'results': <Object>[],
  };
}
