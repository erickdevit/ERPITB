import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:frequencia_itb/core/database/local_database.dart';
import 'package:frequencia_itb/core/database/local_repository.dart';
import 'package:frequencia_itb/core/models/models.dart';
import 'package:frequencia_itb/core/reports/report_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late LocalDatabase database;
  late LocalRepository repository;
  const admin = UserSession(
    id: 'admin',
    name: 'Admin',
    email: 'admin@itb.org.br',
    role: UserRole.admin,
  );

  setUp(() async {
    database = LocalDatabase.inMemory();
    await database.initialize();
    repository = LocalRepository(database);
    database.execute(
      "INSERT INTO courses (id, code, name, active, sync_version, sync_status) VALUES ('course', 'TEC', 'Tecnologia', 1, 1, 'SYNCED')",
    );
    database.execute(
      "INSERT INTO classes (id, course_id, name, shift, active, sync_version, sync_status) VALUES ('class-a', 'course', 'Turma Alpha', 'manha', 1, 1, 'SYNCED'), ('class-b', 'course', 'Turma Beta', 'tarde', 1, 1, 'SYNCED')",
    );
    database.execute(
      "INSERT INTO user_directory (id, name, email, role, active) VALUES ('prof-a', 'Ana Professora', 'ana@itb.org.br', 'professor', 1), ('prof-b', 'Bruno Professor', 'bruno@itb.org.br', 'professor', 1)",
    );
    database.execute(
      "INSERT INTO class_teachers (id, class_id, user_id, sync_version, sync_status) VALUES ('ct-a', 'class-a', 'prof-a', 1, 'SYNCED'), ('ct-b', 'class-b', 'prof-b', 1, 'SYNCED')",
    );
    database.execute(
      "INSERT INTO students (id, name, registration_number, birth_date, active, sync_version, sync_status, created_at) VALUES ('student-a', 'Alice Aluna', 'A-01', '2008-05-14', 1, 1, 'SYNCED', '2026-01-10T12:00:00Z'), ('student-b', 'Beto Aluno', 'B-02', '2009-06-20', 1, 1, 'SYNCED', '2026-02-11T12:00:00Z')",
    );
    database.execute(
      "INSERT INTO enrollments (id, class_id, student_id, status, sync_version, sync_status) VALUES ('enr-a', 'class-a', 'student-a', 'ativa', 1, 'SYNCED'), ('enr-b', 'class-b', 'student-b', 'ativa', 1, 'SYNCED')",
    );
    database.execute(
      "INSERT INTO attendance_records (id, class_id, student_id, date, status, recorded_by_user_id, sync_status, sync_version) VALUES ('att-1', 'class-a', 'student-a', '2026-07-01', 'F', 'admin', 'SYNCED', 1), ('att-2', 'class-a', 'student-a', '2026-07-02', 'F', 'admin', 'SYNCED', 1), ('att-3', 'class-a', 'student-a', '2026-07-03', 'P', 'admin', 'SYNCED', 1), ('att-4', 'class-b', 'student-b', '2026-07-03', 'A', 'admin', 'SYNCED', 1), ('att-old', 'class-b', 'student-b', '2025-01-01', 'F', 'admin', 'SYNCED', 1)",
    );
  });

  tearDown(() => database.dispose());

  test('combines class search with professor filter', () {
    final rows = repository.classes(
      admin,
      search: 'Alpha',
      teacherId: 'prof-a',
    );
    expect(rows, hasLength(1));
    expect(rows.single.teacherName, 'Ana Professora');
    expect(
      repository.classes(admin, search: 'Alpha', teacherId: 'prof-b'),
      isEmpty,
    );
  });

  test('lists all students and combines search with professor filter', () {
    expect(repository.students(null), hasLength(2));
    final rows = repository.students(null, search: 'A-01', teacherId: 'prof-a');
    expect(rows, hasLength(1));
    expect(rows.single.className, 'Turma Alpha');
    expect(rows.single.birthDate, DateTime(2008, 5, 14));
    expect(rows.single.registrationDate, isNotNull);
  });

  test(
    'dashboard period exposes actionable absentee and teacher indicators',
    () {
      final data = repository.dashboard(
        admin,
        from: DateTime(2026, 7, 1),
        to: DateTime(2026, 7, 31),
      );
      expect(data.delayed, 1);
      expect(data.topAbsentees.single.name, 'Alice Aluna');
      expect(data.topAbsentees.single.absences, 2);
      expect(
        data.teacherWorkload.map((item) => item.name),
        containsAll(['Ana Professora', 'Bruno Professor']),
      );
    },
  );

  test('new class and student enqueue their mandatory relationships', () {
    repository.createClass(
      courseId: 'course',
      name: 'Turma Nova',
      shift: 'noite',
      teacherId: 'prof-a',
    );
    final createdClass =
        database
                .select("SELECT id FROM classes WHERE name = 'Turma Nova'")
                .single['id']!
            as String;
    expect(
      database.select(
        'SELECT 1 FROM class_teachers WHERE class_id = ? AND user_id = ?',
        [createdClass, 'prof-a'],
      ),
      isNotEmpty,
    );
    repository.createStudent(
      classId: createdClass,
      name: 'Novo Aluno',
      registrationNumber: 'N-03',
      birthDate: DateTime(2010, 1, 2),
    );
    final createdStudent = database
        .select(
          "SELECT id, birth_date FROM students WHERE registration_number = 'N-03'",
        )
        .single;
    expect(createdStudent['birth_date'], '2010-01-02');
    expect(
      database.select(
        'SELECT 1 FROM enrollments WHERE class_id = ? AND student_id = ?',
        [createdClass, createdStudent['id']],
      ),
      isNotEmpty,
    );
    expect(
      database.select(
        "SELECT entity_name FROM sync_queue WHERE entity_name IN ('classes', 'class_teachers', 'students', 'enrollments')",
      ),
      hasLength(4),
    );
  });

  test('moves a student to another class and synchronizes both enrollments', () {
    repository.moveStudent(studentId: 'student-a', classId: 'class-b');

    expect(repository.students('class-a'), isEmpty);
    expect(
      repository.students('class-b').map((student) => student.id),
      containsAll(['student-a', 'student-b']),
    );
    final operations = database.select(
      "SELECT action FROM sync_queue WHERE entity_name = 'enrollments' ORDER BY action",
    );
    expect(operations, hasLength(2));
    expect(
      operations.map((row) => row['action']),
      containsAll(['delete', 'upsert']),
    );
  });

  test('admin deletions preserve history and reject linked containers', () {
    expect(() => repository.deleteCourse('course'), throwsStateError);
    expect(() => repository.deleteClass('class-a'), throwsStateError);

    repository.deleteStudent('student-a');
    repository.deleteClass('class-a');
    expect(repository.students('class-a'), isEmpty);
    expect(
      repository.classes(admin).map((item) => item.id),
      isNot(contains('class-a')),
    );
    expect(
      database
          .select(
            "SELECT entity_name FROM sync_queue WHERE entity_id IN ('class-a', 'ct-a') ORDER BY rowid",
          )
          .map((row) => row['entity_name']),
      ['classes', 'class_teachers'],
    );
    expect(() => repository.deleteCourse('course'), throwsStateError);

    repository.deleteStudent('student-b');
    repository.deleteClass('class-b');
    repository.deleteCourse('course');
    expect(repository.courses(), isEmpty);
    expect(
      database.select(
        "SELECT entity_name FROM sync_queue WHERE action = 'delete'",
      ),
      isNotEmpty,
    );
    expect(
      database.select(
        "SELECT id FROM attendance_records WHERE student_id = 'student-a'",
      ),
      isNotEmpty,
    );
  });

  test('attendance saves quick status and general and individual notes', () {
    final date = DateTime(2026, 7, 10);
    final drafts = repository.attendanceDrafts('class-a', date);
    expect(drafts, hasLength(1));

    repository.saveAttendance(
      classId: 'class-a',
      date: date,
      user: admin,
      drafts: [
        drafts.single.copyWith(
          status: AttendanceStatus.delayed,
          notes: 'Chegou após o intervalo.',
        ),
      ],
      generalNotes: 'Revisão para a avaliação mensal.',
    );

    final saved = repository.attendanceDrafts('class-a', date).single;
    expect(saved.status, AttendanceStatus.delayed);
    expect(saved.notes, 'Chegou após o intervalo.');
    expect(
      repository.classNote('class-a', date),
      'Revisão para a avaliação mensal.',
    );
    expect(
      database.select(
        "SELECT entity_name FROM sync_queue WHERE entity_name IN ('attendance_records', 'class_notes')",
      ),
      hasLength(2),
    );
  });

  test('saves one student annotation without saving the whole call', () {
    final date = DateTime(2026, 7, 11);
    final draft = repository
        .attendanceDrafts('class-a', date)
        .single
        .copyWith(notes: 'Acompanhamento individual.');

    repository.saveStudentAttendance(
      classId: 'class-a',
      date: date,
      user: admin,
      draft: draft,
    );

    expect(
      repository.attendanceDrafts('class-a', date).single.notes,
      'Acompanhamento individual.',
    );
    expect(repository.classNote('class-a', date), isEmpty);
    expect(
      database.select(
        "SELECT entity_name FROM sync_queue WHERE entity_name = 'attendance_records'",
      ),
      hasLength(1),
    );
  });

  test('report generation accepts combined professor and date scope', () async {
    final service = ReportService(database);
    final request = ReportRequest(
      type: ReportType.institutional,
      user: admin,
      professorId: 'prof-a',
      from: DateTime(2026, 7, 1),
      to: DateTime(2026, 7, 31),
    );
    final scoped = service.institutionalData(request);
    expect(scoped.totals['students'], 1);
    expect(scoped.totals['calls'], 3);
    expect((scoped.totals['rate'] as num).toDouble(), closeTo(33.3, .1));
    final bytes = await service.build(request);
    expect(bytes.length, greaterThan(1000));
    if (Platform.environment['WRITE_REPORT_PREVIEW'] == 'true') {
      final output = Directory('build/qa')..createSync(recursive: true);
      File(
        '${output.path}/relatorio-institucional-qa.pdf',
      ).writeAsBytesSync(bytes);
    }
  });

  test(
    'all scoped report types render with class, student and period',
    () async {
      final service = ReportService(database);
      final period = (from: DateTime(2026, 7, 1), to: DateTime(2026, 7, 31));
      final requests = [
        ReportRequest(
          type: ReportType.course,
          user: admin,
          classId: 'class-a',
          professorId: 'prof-a',
          from: period.from,
          to: period.to,
        ),
        ReportRequest(
          type: ReportType.classDiary,
          user: admin,
          classId: 'class-a',
          professorId: 'prof-a',
          from: period.from,
          to: period.to,
        ),
        ReportRequest(
          type: ReportType.student,
          user: admin,
          classId: 'class-a',
          studentId: 'student-a',
          professorId: 'prof-a',
          from: period.from,
          to: period.to,
        ),
        ReportRequest(
          type: ReportType.dropoutRisk,
          user: admin,
          professorId: 'prof-a',
          from: period.from,
          to: period.to,
        ),
      ];

      for (final request in requests) {
        expect(await service.build(request), hasLength(greaterThan(1000)));
      }
    },
  );

  test('sidebar preference is isolated per user', () {
    repository.setSidebarCollapsed('user-a', true);
    expect(repository.sidebarCollapsedFor('user-a'), isTrue);
    expect(repository.sidebarCollapsedFor('user-b'), isFalse);
  });
}
