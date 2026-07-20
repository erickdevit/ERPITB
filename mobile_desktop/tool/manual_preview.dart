import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:frequencia_itb/core/database/local_database.dart';
import 'package:frequencia_itb/core/database/local_repository.dart';
import 'package:frequencia_itb/core/models/models.dart';
import 'package:frequencia_itb/core/network/api_client.dart';
import 'package:frequencia_itb/core/reports/report_service.dart';
import 'package:frequencia_itb/core/sync/sync_service.dart';
import 'package:frequencia_itb/core/theme/app_theme.dart';
import 'package:frequencia_itb/features/auth/auth_controller.dart';
import 'package:frequencia_itb/features/shell/app_shell.dart';
import 'package:provider/provider.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final database = LocalDatabase.inMemory();
  await database.initialize();
  _seed(database);
  final api = _PreviewApiClient();
  final sync = SyncService(database, api);
  final auth = AuthController(database, api, sync)
    ..session = const UserSession(
      id: 'admin-preview',
      name: 'Admin QA',
      email: 'qa@itb.org.br',
      role: UserRole.admin,
    );
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider.value(value: sync),
        Provider<ApiClient>.value(value: api),
        Provider.value(value: LocalRepository(database)),
        Provider.value(value: ReportService(database)),
      ],
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Frequência ITB — QA',
        theme: buildTheme(),
        home: const AppShell(),
      ),
    ),
  );
}

class _PreviewApiClient extends ApiClient {
  _PreviewApiClient() : super(const FlutterSecureStorage());
  final users = <Map<String, dynamic>>[
    {
      'id': 'admin-preview',
      'name': 'Admin QA',
      'email': 'qa@itb.org.br',
      'role': 'admin',
      'active': 1,
    },
    {
      'id': 'prof-ana',
      'name': 'Ana Professora',
      'email': 'ana@itb.org.br',
      'role': 'professor',
      'active': 1,
    },
    {
      'id': 'prof-bruno',
      'name': 'Bruno Professor',
      'email': 'bruno@itb.org.br',
      'role': 'professor',
      'active': 1,
    },
    {
      'id': 'secretaria',
      'name': 'Equipe Secretaria',
      'email': 'secretaria@itb.org.br',
      'role': 'pedagogico',
      'active': 1,
    },
  ];

  @override
  Future<Map<String, dynamic>> get(String path) async {
    if (path.startsWith('/users')) return {'items': users};
    if (path.startsWith('/audit-logs')) {
      return {
        'items': [
          {
            'action': 'CREATE',
            'entity_name': 'students',
            'entity_id': 'student-alice',
            'user_name': 'Equipe Secretaria',
            'created_at': '2026-07-20T13:10:00Z',
          },
          {
            'action': 'ATTENDANCE_BATCH',
            'entity_name': 'attendance_records',
            'entity_id': 'class-alpha',
            'user_name': 'Ana Professora',
            'created_at': '2026-07-20T14:00:00Z',
          },
        ],
      };
    }
    if (path.startsWith('/conflicts')) return {'items': <Object>[]};
    if (path.contains('/teachers')) {
      return {
        'items': users.where((item) => item['role'] == 'professor').toList(),
      };
    }
    if (path.startsWith('/sync/pull')) {
      return {'changes': <Object>[], 'nextCursor': 0, 'hasMore': false};
    }
    return {'items': <Object>[]};
  }

  @override
  Future<Map<String, dynamic>> post(String path, Object body) async {
    if (path == '/users') {
      final data = Map<String, dynamic>.from(body as Map);
      final created = {...data, 'id': 'preview-${users.length}', 'active': 1};
      users.add(created);
      return created;
    }
    if (path == '/sync/push') return {'results': <Object>[]};
    return {'ok': true};
  }

  @override
  Future<Map<String, dynamic>> patch(String path, Object body) async => {
    'ok': true,
  };
  @override
  Future<Map<String, dynamic>> delete(String path) async => {'ok': true};
}

void _seed(LocalDatabase db) {
  db.execute(
    "INSERT INTO courses (id, code, name, active, sync_version, sync_status) VALUES ('course-tech', 'TEC', 'Tecnologia e Inovação', 1, 1, 'SYNCED')",
  );
  db.execute(
    "INSERT INTO classes (id, course_id, name, shift, active, sync_version, sync_status) VALUES ('class-alpha', 'course-tech', 'Turma Alpha', 'manha', 1, 1, 'SYNCED'), ('class-beta', 'course-tech', 'Turma Beta', 'tarde', 1, 1, 'SYNCED')",
  );
  db.execute(
    "INSERT INTO user_directory (id, name, email, role, active) VALUES ('prof-ana', 'Ana Professora', 'ana@itb.org.br', 'professor', 1), ('prof-bruno', 'Bruno Professor', 'bruno@itb.org.br', 'professor', 1), ('admin-preview', 'Admin QA', 'qa@itb.org.br', 'admin', 1), ('secretaria', 'Equipe Secretaria', 'secretaria@itb.org.br', 'pedagogico', 1)",
  );
  db.execute(
    "INSERT INTO class_teachers (id, class_id, user_id, sync_version, sync_status) VALUES ('ct-alpha', 'class-alpha', 'prof-ana', 1, 'SYNCED'), ('ct-beta', 'class-beta', 'prof-bruno', 1, 'SYNCED')",
  );
  db.execute(
    "INSERT INTO students (id, name, registration_number, birth_date, contact, active, sync_version, sync_status, created_at) VALUES ('student-alice', 'Alice Almeida', '2026-001', '2008-05-14', '(11) 90000-0001', 1, 1, 'SYNCED', '2026-01-10T12:00:00Z'), ('student-beto', 'Beto Barbosa', '2026-002', '2009-06-20', '(11) 90000-0002', 1, 1, 'SYNCED', '2026-01-11T12:00:00Z'), ('student-clara', 'Clara Costa', '2026-003', '2008-08-02', '(11) 90000-0003', 1, 1, 'SYNCED', '2026-01-12T12:00:00Z')",
  );
  db.execute(
    "INSERT INTO enrollments (id, class_id, student_id, status, sync_version, sync_status) VALUES ('enr-a', 'class-alpha', 'student-alice', 'ativa', 1, 'SYNCED'), ('enr-b', 'class-alpha', 'student-beto', 'ativa', 1, 'SYNCED'), ('enr-c', 'class-beta', 'student-clara', 'ativa', 1, 'SYNCED')",
  );
  db.execute(
    "INSERT INTO attendance_records (id, class_id, student_id, date, status, notes, recorded_by_user_id, sync_status, sync_version) VALUES ('att-1', 'class-alpha', 'student-alice', '2026-07-18', 'F', 'Contato com responsável pendente', 'prof-ana', 'SYNCED', 1), ('att-2', 'class-alpha', 'student-alice', '2026-07-19', 'F', NULL, 'prof-ana', 'SYNCED', 1), ('att-3', 'class-alpha', 'student-beto', '2026-07-19', 'P', NULL, 'prof-ana', 'SYNCED', 1), ('att-4', 'class-beta', 'student-clara', '2026-07-19', 'A', 'Chegou 10 minutos após o início', 'prof-bruno', 'SYNCED', 1), ('att-5', 'class-beta', 'student-clara', '2026-07-20', 'J', 'Consulta médica', 'prof-bruno', 'SYNCED', 1)",
  );
  db.execute(
    "INSERT INTO class_notes (id, class_id, date, notes, recorded_by_user_id, sync_version, sync_status) VALUES ('note-alpha', 'class-alpha', '2026-07-20', 'Revisão para a avaliação mensal.', 'prof-ana', 1, 'SYNCED')",
  );
}
