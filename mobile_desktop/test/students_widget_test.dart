import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:frequencia_itb/core/database/local_database.dart';
import 'package:frequencia_itb/core/database/local_repository.dart';
import 'package:frequencia_itb/core/models/models.dart';
import 'package:frequencia_itb/core/network/api_client.dart';
import 'package:frequencia_itb/core/sync/sync_service.dart';
import 'package:frequencia_itb/features/auth/auth_controller.dart';
import 'package:frequencia_itb/features/students/students_screen.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

void main() {
  testWidgets('admin edits the class of an existing student', (tester) async {
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
      "INSERT INTO classes (id, course_id, name, shift, active, sync_version, sync_status) VALUES ('class-a', 'course', 'Turma A', 'manha', 1, 1, 'SYNCED'), ('class-b', 'course', 'Turma B', 'tarde', 1, 1, 'SYNCED')",
    );
    database.execute(
      "INSERT INTO students (id, name, registration_number, active, sync_version, sync_status) VALUES ('student', 'Aluno Teste', 'MAT-01', 1, 1, 'SYNCED')",
    );
    database.execute(
      "INSERT INTO enrollments (id, class_id, student_id, status, sync_version, sync_status) VALUES ('enrollment', 'class-a', 'student', 'ativa', 1, 'SYNCED')",
    );
    final repository = LocalRepository(database);
    final api = ApiClient(
      const FlutterSecureStorage(),
      client: MockClient((request) async {
        if (request.url.path == '/sync/push') {
          return http.Response('{"results":[]}', 200);
        }
        return http.Response(
          '{"changes":[],"nextCursor":0,"hasMore":false}',
          200,
        );
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
        child: const MaterialApp(home: Scaffold(body: StudentsScreen())),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byTooltip('Excluir aluno'), findsOneWidget);
    tester
        .widget<IconButton>(
          find.widgetWithIcon(IconButton, Icons.edit_outlined),
        )
        .onPressed!();
    await tester.pumpAndSettle();
    final classField = find.byWidgetPredicate(
      (widget) =>
          widget is DropdownButtonFormField<String> &&
          widget.decoration.labelText == 'Turma *',
    );
    expect(classField, findsOneWidget);
    tester
        .widget<DropdownButtonFormField<String>>(classField)
        .onChanged!
        .call('class-b');
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();

    expect(repository.students('class-a'), isEmpty);
    expect(repository.students('class-b').single.id, 'student');
  });
}
