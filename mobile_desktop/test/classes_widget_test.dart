import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:frequencia_itb/core/database/local_database.dart';
import 'package:frequencia_itb/core/database/local_repository.dart';
import 'package:frequencia_itb/core/models/models.dart';
import 'package:frequencia_itb/core/network/api_client.dart';
import 'package:frequencia_itb/core/sync/sync_service.dart';
import 'package:frequencia_itb/features/auth/auth_controller.dart';
import 'package:frequencia_itb/features/classes/classes_screen.dart';
import 'package:provider/provider.dart';

class _ClassesApi extends ApiClient {
  _ClassesApi() : super(const FlutterSecureStorage());

  final users = <Map<String, dynamic>>[];
  bool professorCreated = false;

  @override
  Future<Map<String, dynamic>> get(String path) async {
    if (path == '/users') return {'items': users};
    if (path.startsWith('/sync/pull')) {
      return {'changes': <Object>[], 'nextCursor': 0, 'hasMore': false};
    }
    return <String, dynamic>{};
  }

  @override
  Future<Map<String, dynamic>> post(String path, Object body) async {
    if (path == '/users') {
      final data = body as Map<String, dynamic>;
      final created = <String, dynamic>{
        'id': 'prof-inline',
        'name': data['name'],
        'email': data['email'],
        'role': 'professor',
        'active': 1,
      };
      users.add(created);
      professorCreated = true;
      return created;
    }
    if (path == '/sync/push') return {'results': <Object>[]};
    return <String, dynamic>{};
  }
}

void main() {
  testWidgets('creates a professor inline and assigns the new class', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 850);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final database = LocalDatabase.inMemory();
    await database.initialize();
    addTearDown(database.dispose);
    database.execute(
      "INSERT INTO courses (id, code, name, active, sync_version, sync_status) VALUES ('course', 'TEC', 'Tecnologia', 1, 1, 'SYNCED')",
    );
    final repository = LocalRepository(database);
    final api = _ClassesApi();
    final sync = SyncService(database, api);
    final auth = AuthController(database, api, sync)
      ..session = const UserSession(
        id: 'admin-test',
        name: 'Admin Teste',
        email: 'admin@itb.org.br',
        role: UserRole.admin,
      );

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider.value(value: auth),
          ChangeNotifierProvider.value(value: sync),
          Provider<ApiClient>.value(value: api),
          Provider.value(value: repository),
        ],
        child: const MaterialApp(home: Scaffold(body: ClassesScreen())),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Nova turma'));
    await tester.pumpAndSettle();
    expect(find.text('Professor responsável *'), findsOneWidget);
    expect(find.text('Criar professor agora'), findsOneWidget);

    await tester.tap(find.text('Criar professor agora'));
    await tester.pumpAndSettle();
    Finder field(String label) => find.byWidgetPredicate(
      (widget) => widget is TextField && widget.decoration?.labelText == label,
    );
    await tester.enterText(field('Nome *'), 'Professor QA Inline');
    await tester.enterText(field('E-mail *'), 'prof.inline@itb.org.br');
    await tester.enterText(
      field('Senha (mínimo 12 caracteres) *'),
      'SenhaTemporaria!2026',
    );
    await tester.tap(find.text('Criar'));
    await tester.pumpAndSettle();

    expect(api.professorCreated, isTrue);
    expect(find.text('Professor QA Inline'), findsOneWidget);
    await tester.enterText(field('Nome da turma'), 'Turma Inline');
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();

    final createdClass = database
        .select("SELECT id FROM classes WHERE name = 'Turma Inline'")
        .single;
    expect(
      database.select(
        'SELECT 1 FROM class_teachers WHERE class_id = ? AND user_id = ?',
        [createdClass['id'], 'prof-inline'],
      ),
      isNotEmpty,
    );

    database.execute(
      "INSERT INTO students (id, name, registration_number, active, sync_version, sync_status) VALUES ('student-detail', 'Aluno da Turma', 'DET-01', 1, 1, 'SYNCED')",
    );
    database.execute(
      "INSERT INTO enrollments (id, class_id, student_id, status, sync_version, sync_status) VALUES ('enrollment-detail', ?, 'student-detail', 'ativa', 1, 'SYNCED')",
      [createdClass['id']],
    );
    await tester.tap(find.text('Turma Inline'));
    await tester.pumpAndSettle();

    expect(find.byTooltip('Voltar para turmas'), findsOneWidget);
    expect(find.text('1 aluno(s)'), findsOneWidget);
    expect(find.text('Aluno da Turma'), findsOneWidget);
    expect(find.byTooltip('Excluir aluno'), findsOneWidget);
  });
}
