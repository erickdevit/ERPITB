import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:frequencia_itb/core/database/local_database.dart';
import 'package:frequencia_itb/core/database/local_repository.dart';
import 'package:frequencia_itb/core/models/models.dart';
import 'package:frequencia_itb/core/network/api_client.dart';
import 'package:frequencia_itb/core/reports/report_service.dart';
import 'package:frequencia_itb/core/sync/sync_service.dart';
import 'package:frequencia_itb/core/theme/app_theme.dart';
import 'package:frequencia_itb/features/auth/auth_controller.dart';
import 'package:frequencia_itb/features/shell/app_shell.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const secureStorageChannel = MethodChannel(
    'plugins.it_nomads.com/flutter_secure_storage',
  );

  testWidgets('all application areas fit a 390 px mobile viewport', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(secureStorageChannel, (_) async => null);
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(secureStorageChannel, null),
    );

    final database = LocalDatabase.inMemory();
    await database.initialize();
    addTearDown(database.dispose);
    database.execute(
      "INSERT INTO courses (id, code, name, active, sync_version, sync_status) VALUES ('course', 'TEC', 'Tecnologia da Informação', 1, 1, 'SYNCED')",
    );
    database.execute(
      "INSERT INTO classes (id, course_id, name, shift, active, sync_version, sync_status) VALUES ('class', 'course', 'Turma Mobile com nome longo', 'manha', 1, 1, 'SYNCED')",
    );
    database.execute(
      "INSERT INTO students (id, name, registration_number, contact, active, sync_version, sync_status) VALUES ('student', 'Aluno com Nome Completo para Teste', 'MAT-0001', '(11) 99999-9999', 1, 1, 'SYNCED')",
    );
    database.execute(
      "INSERT INTO enrollments (id, class_id, student_id, status, sync_version, sync_status) VALUES ('enrollment', 'class', 'student', 'ativa', 1, 'SYNCED')",
    );

    final repository = LocalRepository(database);
    final client = MockClient((request) async {
      if (request.url.path == '/users') {
        return http.Response(
          '{"items":[{"id":"professor","name":"Professor com Nome Completo","email":"professor@itb.org.br","role":"professor","active":1}]}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (request.url.path == '/sync/push') {
        return http.Response('{"results":[]}', 200);
      }
      if (request.url.path == '/sync/pull') {
        return http.Response(
          '{"changes":[],"nextCursor":0,"hasMore":false}',
          200,
        );
      }
      return http.Response(
        '{"items":[]}',
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = ApiClient(const FlutterSecureStorage(), client: client);
    final sync = SyncService(database, api);
    final auth = AuthController(database, api, sync)
      ..session = const UserSession(
        id: 'admin-mobile',
        name: 'Administrador Mobile',
        email: 'admin@itb.org.br',
        role: UserRole.admin,
      );

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider.value(value: auth),
          ChangeNotifierProvider.value(value: sync),
          Provider.value(value: api),
          Provider.value(value: repository),
          Provider.value(value: ReportService(database)),
        ],
        child: MaterialApp(theme: buildTheme(), home: const AppShell()),
      ),
    );
    await tester.pumpAndSettle();
    _expectNoLayoutFailure(tester, 'Visão geral');

    Future<void> navigateTo(String destination) async {
      tester.state<ScaffoldState>(find.byType(Scaffold).first).openDrawer();
      await tester.pumpAndSettle();
      await tester.tap(find.text(destination).last);
      await tester.pumpAndSettle();
    }

    for (final destination in [
      'Turmas',
      'Alunos',
      'Frequência',
      'Relatórios',
    ]) {
      await navigateTo(destination);
      _expectNoLayoutFailure(tester, destination);
      if (destination == 'Turmas') {
        await tester.tap(find.text('Turma Mobile com nome longo').first);
        await tester.pumpAndSettle();
        _expectNoLayoutFailure(tester, 'Detalhes da turma');
      }
      if (destination == 'Alunos') {
        expect(find.byKey(const Key('mobile-student-list')), findsOneWidget);
      }
      if (destination == 'Frequência') {
        await tester.tap(find.byTooltip('Anotação do aluno'));
        await tester.pumpAndSettle();
        _expectNoLayoutFailure(tester, 'Anotação individual da chamada');
        expect(find.text('Salvar anotação'), findsOneWidget);
      }
    }

    for (final destination in ['Usuários', 'Conflitos', 'Auditoria']) {
      await navigateTo(destination);
      _expectNoLayoutFailure(tester, destination);
      if (destination == 'Usuários') {
        expect(find.byKey(const Key('mobile-user-list')), findsOneWidget);
      }
    }
  });
}

void _expectNoLayoutFailure(WidgetTester tester, String destination) {
  expect(
    tester.takeException(),
    isNull,
    reason: '$destination must render without overflow or layout exceptions',
  );
}
