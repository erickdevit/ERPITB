import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:frequencia_itb/core/database/local_database.dart';
import 'package:frequencia_itb/core/database/local_repository.dart';
import 'package:frequencia_itb/core/models/models.dart';
import 'package:frequencia_itb/core/network/api_client.dart';
import 'package:frequencia_itb/core/sync/sync_service.dart';
import 'package:frequencia_itb/features/attendance/attendance_screen.dart';
import 'package:frequencia_itb/features/auth/auth_controller.dart';
import 'package:frequencia_itb/features/replacements/replacements_screen.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

void main() {
  testWidgets('selects R option in attendance and displays student in Reposição screen', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1300, 850);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final database = LocalDatabase.inMemory();
    await database.initialize();
    addTearDown(database.dispose);
    database.execute(
      "INSERT INTO courses (id, code, name, active, sync_version, sync_status) VALUES ('course', 'TEC', 'Tecnologia', 1, 1, 'SYNCED')",
    );
    database.execute(
      "INSERT INTO classes (id, course_id, name, shift, active, sync_version, sync_status) VALUES ('class', 'course', 'Turma A', 'manha', 1, 1, 'SYNCED')",
    );
    database.execute(
      "INSERT INTO students (id, name, registration_number, active, sync_version, sync_status) VALUES ('student', 'Aluno Reposicao', 'MAT-99', 1, 1, 'SYNCED')",
    );
    database.execute(
      "INSERT INTO enrollments (id, class_id, student_id, status, sync_version, sync_status) VALUES ('enrollment', 'class', 'student', 'ativa', 1, 'SYNCED')",
    );
    final repository = LocalRepository(database);
    final api = ApiClient(
      const FlutterSecureStorage(),
      client: MockClient((request) async {
        return http.Response('{"results":[],"changes":[],"nextCursor":0,"hasMore":false}', 200);
      }),
    );
    final sync = SyncService(database, api);
    final auth = AuthController(database, api, sync)
      ..session = const UserSession(
        id: 'admin',
        name: 'Admin',
        email: 'admin@itb.org.br',
        role: UserRole.admin,
      );

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider.value(value: auth),
          ChangeNotifierProvider.value(value: sync),
          Provider.value(value: repository),
        ],
        child: const MaterialApp(home: Scaffold(body: AttendanceScreen())),
      ),
    );
    await tester.pumpAndSettle();

    // Verify R segment button exists
    expect(find.text('R'), findsOneWidget);

    // Tap R segment button
    await tester.tap(find.text('R'));
    await tester.pumpAndSettle();

    // Verify replacement modal opened
    expect(find.textContaining('Agendar Reposição'), findsOneWidget);
    expect(find.text('Confirmar Reposição'), findsOneWidget);

    // Confirm replacement modal
    await tester.tap(find.text('Confirmar Reposição'));
    await tester.pumpAndSettle();

    // Save attendance
    await tester.tap(find.text('Salvar chamada'));
    await tester.pumpAndSettle();

    // Check replacement record in repository
    final replacements = repository.replacementRecords();
    expect(replacements.length, 1);
    expect(replacements.first.studentName, 'Aluno Reposicao');

    // Render ReplacementsScreen and verify item displays
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider.value(value: auth),
          ChangeNotifierProvider.value(value: sync),
          Provider.value(value: repository),
          Provider<UserSession?>.value(value: auth.session),
        ],
        child: const MaterialApp(home: Scaffold(body: ReplacementsScreen())),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Alunos em Reposição'), findsOneWidget);
    expect(find.text('Aluno Reposicao'), findsOneWidget);
    expect(find.textContaining('Reposição (R)'), findsOneWidget);
  });
}
