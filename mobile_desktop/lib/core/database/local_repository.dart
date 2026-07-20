import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../models/models.dart';
import 'local_database.dart';

class LocalRepository {
  const LocalRepository(this.database);
  final LocalDatabase database;
  static const _uuid = Uuid();

  List<Map<String, Object?>> courses() => database.select(
    'SELECT id, code, name, active, sync_version FROM courses WHERE deleted_at IS NULL ORDER BY name',
  );

  void createCourse({required String code, required String name}) {
    final id = _uuid.v4();
    final timestamp = DateTime.now().toUtc().toIso8601String();
    final data = <String, Object?>{
      'id': id,
      'code': code.trim().toUpperCase(),
      'name': name.trim(),
      'active': 1,
      'sync_version': 0,
      'created_at': timestamp,
      'updated_at': timestamp,
    };
    database.transaction(() {
      database.execute(
        '''INSERT INTO courses (id, code, name, active, sync_version, sync_status, created_at, updated_at)
           VALUES (?, ?, ?, 1, 0, 'PENDING', ?, ?)''',
        [id, data['code'], data['name'], timestamp, timestamp],
      );
      database.enqueue(
        entity: 'courses',
        entityId: id,
        action: 'upsert',
        baseVersion: 0,
        data: data,
      );
    });
  }

  void updateCourse({
    required String id,
    required String code,
    required String name,
  }) {
    final current = database.select('SELECT * FROM courses WHERE id = ?', [
      id,
    ]).first;
    final timestamp = DateTime.now().toUtc().toIso8601String();
    final data = <String, Object?>{
      ...current,
      'code': code.trim().toUpperCase(),
      'name': name.trim(),
      'updated_at': timestamp,
    };
    database.transaction(() {
      database.execute(
        "UPDATE courses SET code = ?, name = ?, sync_status = 'PENDING', updated_at = ? WHERE id = ?",
        [data['code'], data['name'], timestamp, id],
      );
      database.enqueue(
        entity: 'courses',
        entityId: id,
        action: 'upsert',
        baseVersion: current['sync_version']! as int,
        data: data,
      );
    });
  }

  void deleteCourse(String id) {
    final linkedClasses = database.select(
      'SELECT 1 FROM classes WHERE course_id = ? AND deleted_at IS NULL LIMIT 1',
      [id],
    );
    if (linkedClasses.isNotEmpty) {
      throw StateError('Exclua as turmas deste curso antes de excluí-lo.');
    }
    _deleteEntity('courses', id);
  }

  void createClass({
    required String courseId,
    required String name,
    required String shift,
    required String teacherId,
  }) {
    final id = _uuid.v4();
    final assignmentId = _uuid.v4();
    final timestamp = DateTime.now().toUtc().toIso8601String();
    final data = <String, Object?>{
      'id': id,
      'course_id': courseId,
      'name': name.trim(),
      'shift': shift,
      'active': 1,
      'sync_version': 0,
      'created_at': timestamp,
      'updated_at': timestamp,
    };
    database.transaction(() {
      database.execute(
        '''INSERT INTO classes (id, course_id, name, shift, active, sync_version, sync_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, 0, 'PENDING', ?, ?)''',
        [id, courseId, name.trim(), shift, timestamp, timestamp],
      );
      database.enqueue(
        entity: 'classes',
        entityId: id,
        action: 'upsert',
        baseVersion: 0,
        data: data,
      );
      final assignment = <String, Object?>{
        'id': assignmentId,
        'class_id': id,
        'user_id': teacherId,
        'sync_version': 0,
        'created_at': timestamp,
        'updated_at': timestamp,
      };
      database.execute(
        "INSERT INTO class_teachers (id, class_id, user_id, sync_version, sync_status, created_at, updated_at) VALUES (?, ?, ?, 0, 'PENDING', ?, ?)",
        [assignmentId, id, teacherId, timestamp, timestamp],
      );
      database.enqueue(
        entity: 'class_teachers',
        entityId: assignmentId,
        action: 'upsert',
        baseVersion: 0,
        data: assignment,
      );
    });
  }

  void updateClass({
    required String id,
    required String name,
    required String shift,
  }) {
    final current = database.select('SELECT * FROM classes WHERE id = ?', [
      id,
    ]).first;
    final timestamp = DateTime.now().toUtc().toIso8601String();
    final data = <String, Object?>{
      ...current,
      'name': name.trim(),
      'shift': shift,
      'updated_at': timestamp,
    };
    database.transaction(() {
      database.execute(
        "UPDATE classes SET name = ?, shift = ?, sync_status = 'PENDING', updated_at = ? WHERE id = ?",
        [name.trim(), shift, timestamp, id],
      );
      database.enqueue(
        entity: 'classes',
        entityId: id,
        action: 'upsert',
        baseVersion: current['sync_version']! as int,
        data: data,
      );
    });
  }

  void deleteClass(String id) {
    final linkedStudents = database.select(
      '''SELECT 1 FROM enrollments e
           JOIN students s ON s.id = e.student_id
          WHERE e.class_id = ? AND e.deleted_at IS NULL
            AND e.status = 'ativa' AND s.deleted_at IS NULL AND s.active = 1
          LIMIT 1''',
      [id],
    );
    if (linkedStudents.isNotEmpty) {
      throw StateError(
        'Transfira ou exclua os alunos ativos antes de excluir a turma.',
      );
    }
    final assignments = database.select(
      'SELECT * FROM class_teachers WHERE class_id = ? AND deleted_at IS NULL',
      [id],
    );
    final enrollments = database.select(
      'SELECT * FROM enrollments WHERE class_id = ? AND deleted_at IS NULL',
      [id],
    );
    final timestamp = DateTime.now().toUtc().toIso8601String();
    database.transaction(() {
      _deleteEntity('classes', id, inTransaction: true);
      for (final relation in [...assignments, ...enrollments]) {
        final entity = relation.containsKey('user_id')
            ? 'class_teachers'
            : 'enrollments';
        final relationId = relation['id']! as String;
        final deleted = <String, Object?>{
          ...relation,
          'deleted_at': timestamp,
          'updated_at': timestamp,
        };
        database.execute(
          "UPDATE $entity SET deleted_at = ?, sync_status = 'PENDING', updated_at = ? WHERE id = ?",
          [timestamp, timestamp, relationId],
        );
        database.enqueue(
          entity: entity,
          entityId: relationId,
          action: 'delete',
          baseVersion: relation['sync_version']! as int,
          data: deleted,
        );
      }
    });
  }

  void createStudent({
    required String classId,
    required String name,
    required String registrationNumber,
    String? cpf,
    String? contact,
    DateTime? birthDate,
  }) {
    final studentId = _uuid.v4();
    final enrollmentId = _uuid.v4();
    final timestamp = DateTime.now().toUtc().toIso8601String();
    final student = <String, Object?>{
      'id': studentId,
      'name': name.trim(),
      'cpf': _nullable(cpf),
      'contact': _nullable(contact),
      'registration_number': registrationNumber.trim(),
      'birth_date': birthDate == null
          ? null
          : DateFormat('yyyy-MM-dd').format(birthDate),
      'active': 1,
      'sync_version': 0,
      'created_at': timestamp,
      'updated_at': timestamp,
    };
    final enrollment = <String, Object?>{
      'id': enrollmentId,
      'class_id': classId,
      'student_id': studentId,
      'status': 'ativa',
      'sync_version': 0,
      'created_at': timestamp,
      'updated_at': timestamp,
    };
    database.transaction(() {
      database.execute(
        '''INSERT INTO students (id, name, cpf, contact, registration_number, birth_date, active, sync_version, sync_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, 0, 'PENDING', ?, ?)''',
        [
          studentId,
          student['name'],
          student['cpf'],
          student['contact'],
          student['registration_number'],
          student['birth_date'],
          timestamp,
          timestamp,
        ],
      );
      database.enqueue(
        entity: 'students',
        entityId: studentId,
        action: 'upsert',
        baseVersion: 0,
        data: student,
      );
      database.execute(
        '''INSERT INTO enrollments (id, class_id, student_id, status, sync_version, sync_status, created_at, updated_at)
           VALUES (?, ?, ?, 'ativa', 0, 'PENDING', ?, ?)''',
        [enrollmentId, classId, studentId, timestamp, timestamp],
      );
      database.enqueue(
        entity: 'enrollments',
        entityId: enrollmentId,
        action: 'upsert',
        baseVersion: 0,
        data: enrollment,
      );
    });
  }

  void updateStudent({
    required String id,
    required String name,
    required String registrationNumber,
    String? cpf,
    String? contact,
    DateTime? birthDate,
  }) {
    final current = database.select('SELECT * FROM students WHERE id = ?', [
      id,
    ]).first;
    final timestamp = DateTime.now().toUtc().toIso8601String();
    final data = <String, Object?>{
      ...current,
      'name': name.trim(),
      'registration_number': registrationNumber.trim(),
      'cpf': _nullable(cpf),
      'contact': _nullable(contact),
      'birth_date': birthDate == null
          ? null
          : DateFormat('yyyy-MM-dd').format(birthDate),
      'updated_at': timestamp,
    };
    database.transaction(() {
      database.execute(
        "UPDATE students SET name = ?, registration_number = ?, cpf = ?, contact = ?, birth_date = ?, sync_status = 'PENDING', updated_at = ? WHERE id = ?",
        [
          data['name'],
          data['registration_number'],
          data['cpf'],
          data['contact'],
          data['birth_date'],
          timestamp,
          id,
        ],
      );
      database.enqueue(
        entity: 'students',
        entityId: id,
        action: 'upsert',
        baseVersion: current['sync_version']! as int,
        data: data,
      );
    });
  }

  void moveStudent({required String studentId, required String classId}) {
    final currentEnrollments = database.select(
      'SELECT * FROM enrollments WHERE student_id = ? AND deleted_at IS NULL',
      [studentId],
    );
    if (currentEnrollments.any(
      (row) => row['class_id'] == classId && row['status'] == 'ativa',
    )) {
      return;
    }
    final timestamp = DateTime.now().toUtc().toIso8601String();
    database.transaction(() {
      for (final enrollment in currentEnrollments) {
        final enrollmentId = enrollment['id']! as String;
        final deleted = <String, Object?>{
          ...enrollment,
          'deleted_at': timestamp,
          'updated_at': timestamp,
        };
        database.execute(
          "UPDATE enrollments SET deleted_at = ?, sync_status = 'PENDING', updated_at = ? WHERE id = ?",
          [timestamp, timestamp, enrollmentId],
        );
        database.enqueue(
          entity: 'enrollments',
          entityId: enrollmentId,
          action: 'delete',
          baseVersion: enrollment['sync_version']! as int,
          data: deleted,
        );
      }

      final previousTarget = database.select(
        'SELECT * FROM enrollments WHERE student_id = ? AND class_id = ?',
        [studentId, classId],
      );
      final enrollmentId = previousTarget.isEmpty
          ? _uuid.v4()
          : previousTarget.first['id']! as String;
      final baseVersion = previousTarget.isEmpty
          ? 0
          : previousTarget.first['sync_version']! as int;
      final createdAt = previousTarget.isEmpty
          ? timestamp
          : previousTarget.first['created_at'] as String? ?? timestamp;
      final enrollment = <String, Object?>{
        'id': enrollmentId,
        'class_id': classId,
        'student_id': studentId,
        'status': 'ativa',
        'sync_version': baseVersion,
        'created_at': createdAt,
        'updated_at': timestamp,
        'deleted_at': null,
      };
      database.execute(
        '''INSERT INTO enrollments (id, class_id, student_id, status, sync_version, sync_status, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, 'ativa', ?, 'PENDING', ?, ?, NULL)
           ON CONFLICT(class_id, student_id) DO UPDATE SET status = 'ativa', deleted_at = NULL,
             sync_status = 'PENDING', updated_at = excluded.updated_at''',
        [enrollmentId, classId, studentId, baseVersion, createdAt, timestamp],
      );
      database.enqueue(
        entity: 'enrollments',
        entityId: enrollmentId,
        action: 'upsert',
        baseVersion: baseVersion,
        data: enrollment,
      );
    });
  }

  void inactivateStudent(String id) {
    final current = database.select('SELECT * FROM students WHERE id = ?', [
      id,
    ]).first;
    final timestamp = DateTime.now().toUtc().toIso8601String();
    final data = <String, Object?>{
      ...current,
      'active': 0,
      'updated_at': timestamp,
    };
    database.transaction(() {
      database.execute(
        "UPDATE students SET active = 0, sync_status = 'PENDING', updated_at = ? WHERE id = ?",
        [timestamp, id],
      );
      database.enqueue(
        entity: 'students',
        entityId: id,
        action: 'upsert',
        baseVersion: current['sync_version']! as int,
        data: data,
      );
    });
  }

  void deleteStudent(String id) {
    final enrollments = database.select(
      'SELECT * FROM enrollments WHERE student_id = ? AND deleted_at IS NULL',
      [id],
    );
    final timestamp = DateTime.now().toUtc().toIso8601String();
    database.transaction(() {
      for (final enrollment in enrollments) {
        final enrollmentId = enrollment['id']! as String;
        final deleted = <String, Object?>{
          ...enrollment,
          'deleted_at': timestamp,
          'updated_at': timestamp,
        };
        database.execute(
          "UPDATE enrollments SET deleted_at = ?, sync_status = 'PENDING', updated_at = ? WHERE id = ?",
          [timestamp, timestamp, enrollmentId],
        );
        database.enqueue(
          entity: 'enrollments',
          entityId: enrollmentId,
          action: 'delete',
          baseVersion: enrollment['sync_version']! as int,
          data: deleted,
        );
      }
      _deleteEntity('students', id, inTransaction: true);
    });
  }

  void _deleteEntity(String entity, String id, {bool inTransaction = false}) {
    final current = database.select('SELECT * FROM $entity WHERE id = ?', [
      id,
    ]).first;
    final timestamp = DateTime.now().toUtc().toIso8601String();
    final deleted = <String, Object?>{
      ...current,
      'active': 0,
      'deleted_at': timestamp,
      'updated_at': timestamp,
    };
    void action() {
      database.execute(
        "UPDATE $entity SET active = 0, deleted_at = ?, sync_status = 'PENDING', updated_at = ? WHERE id = ?",
        [timestamp, timestamp, id],
      );
      database.enqueue(
        entity: entity,
        entityId: id,
        action: 'delete',
        baseVersion: current['sync_version']! as int,
        data: deleted,
      );
    }

    if (inTransaction) {
      action();
    } else {
      database.transaction(action);
    }
  }

  String? _nullable(String? value) =>
      value == null || value.trim().isEmpty ? null : value.trim();

  List<ClassSummary> classes(
    UserSession user, {
    String? search,
    String? teacherId,
    DateTime? from,
    DateTime? to,
  }) {
    final teacherJoin = user.role == UserRole.professor
        ? 'JOIN class_teachers ct ON ct.class_id = c.id AND ct.user_id = ? AND ct.deleted_at IS NULL'
        : '';
    final where = <String>['c.deleted_at IS NULL', 'c.active = 1'];
    final args = <Object?>[];
    if (user.role == UserRole.professor) args.add(user.id);
    final attendancePeriod = from != null || to != null;
    if (attendancePeriod) {
      args.add(DateFormat('yyyy-MM-dd').format(from ?? DateTime(2000)));
      args.add(DateFormat('yyyy-MM-dd').format(to ?? DateTime.now()));
    }
    if (teacherId != null && teacherId.isNotEmpty) {
      where.add(
        'EXISTS (SELECT 1 FROM class_teachers tf WHERE tf.class_id = c.id AND tf.user_id = ? AND tf.deleted_at IS NULL)',
      );
      args.add(teacherId);
    }
    if (search != null && search.trim().isNotEmpty) {
      where.add('(c.name LIKE ? OR co.name LIKE ?)');
      final term = '%${search.trim()}%';
      args.addAll([term, term]);
    }
    final rows = database.select(
      '''SELECT c.id, c.course_id, c.name, c.shift, co.name AS course_name,
                MIN(cta.user_id) AS teacher_id, MIN(ud.name) AS teacher_name,
                COALESCE(ROUND(100.0 * SUM(CASE WHEN a.status = 'P' THEN 1 ELSE 0 END) / NULLIF(COUNT(a.id), 0), 1), 0) AS attendance_rate
           FROM classes c JOIN courses co ON co.id = c.course_id $teacherJoin
           LEFT JOIN class_teachers cta ON cta.class_id = c.id AND cta.deleted_at IS NULL
           LEFT JOIN user_directory ud ON ud.id = cta.user_id
           LEFT JOIN attendance_records a ON a.class_id = c.id AND a.deleted_at IS NULL ${attendancePeriod ? 'AND a.date BETWEEN ? AND ?' : ''}
          WHERE ${where.join(' AND ')}
          GROUP BY c.id, c.course_id, c.name, c.shift, co.name ORDER BY co.name, c.name''',
      args,
    );
    return rows.map(ClassSummary.fromMap).toList();
  }

  List<Student> students(
    String? classId, {
    String? performance,
    String? enrollmentStatus,
    String? search,
    String? teacherId,
  }) {
    final where = <String>[
      'e.deleted_at IS NULL',
      's.deleted_at IS NULL',
      's.active = 1',
    ];
    final args = <Object?>[];
    if (classId != null && classId.isNotEmpty) {
      where.add('e.class_id = ?');
      args.add(classId);
    }
    if (teacherId != null && teacherId.isNotEmpty) {
      where.add(
        'EXISTS (SELECT 1 FROM class_teachers tf WHERE tf.class_id = e.class_id AND tf.user_id = ? AND tf.deleted_at IS NULL)',
      );
      args.add(teacherId);
    }
    if (search != null && search.trim().isNotEmpty) {
      where.add(
        '(s.name LIKE ? OR s.registration_number LIKE ? OR COALESCE(s.cpf, \'\') LIKE ?)',
      );
      final term = '%${search.trim()}%';
      args.addAll([term, term, term]);
    }
    if (enrollmentStatus != null) {
      where.add('e.status = ?');
      args.add(enrollmentStatus);
    }
    final having = switch (performance) {
      'critical' => 'HAVING rate < 75',
      'attention' => 'HAVING rate >= 75 AND rate <= 85',
      'regular' => 'HAVING rate > 85',
      _ => '',
    };
    final rows = database.select(
      '''SELECT s.id, s.name, s.cpf, s.contact, s.registration_number, s.birth_date, s.created_at,
                e.status AS enrollment_status, e.class_id, c.name AS class_name,
                COALESCE(100.0 * SUM(CASE WHEN a.status = 'P' THEN 1 ELSE 0 END) / NULLIF(COUNT(a.id), 0), 100) AS rate
           FROM students s JOIN enrollments e ON e.student_id = s.id JOIN classes c ON c.id = e.class_id
           LEFT JOIN attendance_records a ON a.student_id = s.id AND a.class_id = e.class_id AND a.deleted_at IS NULL
          WHERE ${where.join(' AND ')}
          GROUP BY s.id, s.name, s.cpf, s.contact, s.registration_number, s.birth_date, s.created_at, e.status, e.class_id, c.name $having
          ORDER BY s.name''',
      args,
    );
    return rows.map(Student.fromMap).toList();
  }

  List<AttendanceDraft> attendanceDrafts(String classId, DateTime date) {
    final day = DateFormat('yyyy-MM-dd').format(date);
    final rows = database.select(
      '''SELECT s.id, s.name, s.cpf, s.contact, s.registration_number, e.status AS enrollment_status,
                COALESCE(a.status, 'P') AS attendance_status, a.notes
           FROM students s JOIN enrollments e ON e.student_id = s.id
           LEFT JOIN attendance_records a ON a.student_id = s.id AND a.class_id = e.class_id AND a.date = ? AND a.deleted_at IS NULL
          WHERE e.class_id = ? AND e.status = 'ativa' AND e.deleted_at IS NULL AND s.deleted_at IS NULL
          ORDER BY s.name''',
      [day, classId],
    );
    return rows
        .map(
          (row) => AttendanceDraft(
            student: Student.fromMap(row),
            status: AttendanceStatus.fromCode(
              row['attendance_status']! as String,
            ),
            notes: row['notes'] as String?,
          ),
        )
        .toList();
  }

  bool callExists(String classId, DateTime date) {
    final day = DateFormat('yyyy-MM-dd').format(date);
    return database.select(
      'SELECT 1 FROM attendance_records WHERE class_id = ? AND date = ? AND deleted_at IS NULL LIMIT 1',
      [classId, day],
    ).isNotEmpty;
  }

  String classNote(String classId, DateTime date) {
    final day = DateFormat('yyyy-MM-dd').format(date);
    final rows = database.select(
      'SELECT notes FROM class_notes WHERE class_id = ? AND date = ? AND deleted_at IS NULL',
      [classId, day],
    );
    return rows.isEmpty ? '' : (rows.first['notes'] as String? ?? '');
  }

  void saveAttendance({
    required String classId,
    required DateTime date,
    required UserSession user,
    required List<AttendanceDraft> drafts,
    String? generalNotes,
  }) {
    final day = DateFormat('yyyy-MM-dd').format(date);
    final timestamp = DateTime.now().toUtc().toIso8601String();
    database.transaction(() {
      for (final draft in drafts) {
        _saveAttendanceDraft(
          classId: classId,
          day: day,
          user: user,
          draft: draft,
          timestamp: timestamp,
        );
      }
      final existingNote = database.select(
        'SELECT id, sync_version, created_at FROM class_notes WHERE class_id = ? AND date = ?',
        [classId, day],
      );
      final noteId = existingNote.isEmpty
          ? _uuid.v4()
          : existingNote.first['id']! as String;
      final baseVersion = existingNote.isEmpty
          ? 0
          : existingNote.first['sync_version']! as int;
      final createdAt = existingNote.isEmpty
          ? timestamp
          : existingNote.first['created_at'] as String? ?? timestamp;
      final note = <String, Object?>{
        'id': noteId,
        'class_id': classId,
        'date': day,
        'notes': _nullable(generalNotes),
        'recorded_by_user_id': user.id,
        'sync_version': baseVersion,
        'created_at': createdAt,
        'updated_at': timestamp,
      };
      database.execute(
        "INSERT INTO class_notes (id, class_id, date, notes, recorded_by_user_id, sync_version, sync_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?) ON CONFLICT(class_id, date) DO UPDATE SET notes = excluded.notes, recorded_by_user_id = excluded.recorded_by_user_id, sync_status = 'PENDING', updated_at = excluded.updated_at",
        [
          noteId,
          classId,
          day,
          note['notes'],
          user.id,
          baseVersion,
          createdAt,
          timestamp,
        ],
      );
      database.enqueue(
        entity: 'class_notes',
        entityId: noteId,
        action: 'upsert',
        baseVersion: baseVersion,
        data: note,
      );
    });
  }

  void saveStudentAttendance({
    required String classId,
    required DateTime date,
    required UserSession user,
    required AttendanceDraft draft,
  }) {
    final day = DateFormat('yyyy-MM-dd').format(date);
    final timestamp = DateTime.now().toUtc().toIso8601String();
    database.transaction(
      () => _saveAttendanceDraft(
        classId: classId,
        day: day,
        user: user,
        draft: draft,
        timestamp: timestamp,
      ),
    );
  }

  void _saveAttendanceDraft({
    required String classId,
    required String day,
    required UserSession user,
    required AttendanceDraft draft,
    required String timestamp,
  }) {
    final existing = database.select(
      'SELECT id, sync_version, created_at FROM attendance_records WHERE class_id = ? AND student_id = ? AND date = ?',
      [classId, draft.student.id, day],
    );
    final id = existing.isEmpty ? _uuid.v4() : existing.first['id']! as String;
    final baseVersion = existing.isEmpty
        ? 0
        : existing.first['sync_version']! as int;
    final createdAt = existing.isEmpty
        ? timestamp
        : existing.first['created_at'] as String? ?? timestamp;
    final notes = _nullable(draft.notes);
    final payload = <String, Object?>{
      'id': id,
      'class_id': classId,
      'student_id': draft.student.id,
      'date': day,
      'status': draft.status.code,
      'notes': notes,
      'recorded_by_user_id': user.id,
      'sync_status': 'PENDING',
      'sync_version': baseVersion,
      'created_at': createdAt,
      'updated_at': timestamp,
    };
    database.execute(
      '''INSERT INTO attendance_records (id, class_id, student_id, date, status, notes, recorded_by_user_id, sync_status, sync_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
         ON CONFLICT(class_id, student_id, date) DO UPDATE SET status = excluded.status, notes = excluded.notes,
           recorded_by_user_id = excluded.recorded_by_user_id, sync_status = 'PENDING', updated_at = excluded.updated_at''',
      [
        id,
        classId,
        draft.student.id,
        day,
        draft.status.code,
        notes,
        user.id,
        baseVersion,
        createdAt,
        timestamp,
      ],
    );
    database.enqueue(
      entity: 'attendance_records',
      entityId: id,
      action: 'upsert',
      baseVersion: baseVersion,
      data: payload,
    );
  }

  DashboardData dashboard(UserSession user, {DateTime? from, DateTime? to}) {
    final visibleClasses = classes(user, from: from, to: to);
    final ids = visibleClasses.map((item) => item.id).toList();
    if (ids.isEmpty) {
      return const DashboardData(
        globalRate: 0,
        present: 0,
        absent: 0,
        justified: 0,
        delayed: 0,
        byClass: [],
        evolution: [],
        riskStudents: 0,
        topAbsentees: [],
        teacherWorkload: [],
      );
    }
    final marks = List.filled(ids.length, '?').join(',');
    final start = DateFormat(
      'yyyy-MM-dd',
    ).format(from ?? DateTime.now().subtract(const Duration(days: 29)));
    final end = DateFormat('yyyy-MM-dd').format(to ?? DateTime.now());
    final periodArgs = <Object?>[...ids, start, end];
    final totals = database.select(
      '''SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN status = 'F' THEN 1 ELSE 0 END) AS absent,
                SUM(CASE WHEN status = 'J' THEN 1 ELSE 0 END) AS justified
               ,SUM(CASE WHEN status = 'A' THEN 1 ELSE 0 END) AS delayed
           FROM attendance_records WHERE class_id IN ($marks) AND deleted_at IS NULL AND date BETWEEN ? AND ?''',
      periodArgs,
    ).first;
    final total = totals['total']! as int;
    final present = (totals['present'] as int?) ?? 0;
    final absent = (totals['absent'] as int?) ?? 0;
    final justified = (totals['justified'] as int?) ?? 0;
    final delayed = (totals['delayed'] as int?) ?? 0;
    final evolutionRows = database.select(
      '''SELECT date, 100.0 * SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) / COUNT(*) AS rate
           FROM attendance_records WHERE class_id IN ($marks) AND deleted_at IS NULL
             AND date BETWEEN ? AND ? GROUP BY date ORDER BY date''',
      periodArgs,
    );
    final riskRows = database.select(
      '''SELECT student_id, 100.0 * SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) / COUNT(*) AS rate
           FROM attendance_records WHERE class_id IN ($marks) AND deleted_at IS NULL AND date BETWEEN ? AND ? GROUP BY student_id HAVING rate < 75''',
      periodArgs,
    );
    final consecutiveRisk = <String>{};
    final absences = database.select(
      '''SELECT student_id, date, status FROM attendance_records
          WHERE class_id IN ($marks) AND deleted_at IS NULL AND date BETWEEN ? AND ? ORDER BY student_id, date''',
      periodArgs,
    );
    String? lastStudent;
    var streak = 0;
    for (final row in absences) {
      final studentId = row['student_id']! as String;
      if (studentId != lastStudent) {
        lastStudent = studentId;
        streak = 0;
      }
      streak = row['status'] == 'F' ? streak + 1 : 0;
      if (streak >= 3) consecutiveRisk.add(studentId);
    }
    final risk = {
      ...riskRows.map((row) => row['student_id']! as String),
      ...consecutiveRisk,
    }.length;
    final absenteeRows = database.select(
      '''SELECT s.name, s.registration_number,
                SUM(CASE WHEN a.status = 'F' THEN 1 ELSE 0 END) AS absences,
                100.0 * SUM(CASE WHEN a.status = 'P' THEN 1 ELSE 0 END) / COUNT(*) AS rate
           FROM attendance_records a JOIN students s ON s.id = a.student_id
          WHERE a.class_id IN ($marks) AND a.deleted_at IS NULL AND a.date BETWEEN ? AND ?
          GROUP BY s.id, s.name, s.registration_number
          HAVING absences > 0 ORDER BY absences DESC, rate ASC LIMIT 5''',
      periodArgs,
    );
    final teacherRows = database.select(
      '''SELECT COALESCE(ud.name, substr(ct.user_id, 1, 8)) AS teacher_name,
                COUNT(DISTINCT ct.class_id) AS classes,
                COUNT(DISTINCT e.student_id) AS students
           FROM class_teachers ct
           LEFT JOIN user_directory ud ON ud.id = ct.user_id
           LEFT JOIN enrollments e ON e.class_id = ct.class_id AND e.status = 'ativa' AND e.deleted_at IS NULL
          WHERE ct.class_id IN ($marks) AND ct.deleted_at IS NULL
            AND EXISTS (SELECT 1 FROM attendance_records ap WHERE ap.class_id = ct.class_id AND ap.deleted_at IS NULL AND ap.date BETWEEN ? AND ?)
          GROUP BY ct.user_id, ud.name ORDER BY classes DESC, teacher_name''',
      periodArgs,
    );
    return DashboardData(
      globalRate: total == 0 ? 0 : present * 100 / total,
      present: present,
      absent: absent,
      justified: justified,
      delayed: delayed,
      byClass: visibleClasses,
      evolution: evolutionRows
          .map(
            (row) => (
              date: DateTime.parse(row['date']! as String),
              rate: (row['rate']! as num).toDouble(),
            ),
          )
          .toList(),
      riskStudents: risk,
      topAbsentees: absenteeRows
          .map(
            (row) => AbsenteeSummary(
              name: row['name']! as String,
              registrationNumber: row['registration_number']! as String,
              absences: (row['absences']! as num).toInt(),
              attendanceRate: (row['rate']! as num).toDouble(),
            ),
          )
          .toList(),
      teacherWorkload: teacherRows
          .map(
            (row) => TeacherWorkload(
              name: row['teacher_name']! as String,
              classes: (row['classes']! as num).toInt(),
              students: (row['students']! as num).toInt(),
            ),
          )
          .toList(),
    );
  }

  List<Map<String, Object?>> conflicts() =>
      database.select('SELECT * FROM local_conflicts ORDER BY created_at DESC');
  void dismissConflict(String id, Map<String, dynamic>? remoteData) =>
      database.dismissConflict(id, remoteData);
  List<Map<String, Object?>> auditSummary() => database.select(
    '''SELECT updated_at AS created_at, 'SYNC_LOCAL' AS action, entity_name, entity_id,
                  CASE WHEN attempts > 0 THEN 'Nova tentativa pendente' ELSE 'Aguardando envio' END AS details
             FROM sync_queue ORDER BY updated_at DESC LIMIT 200''',
  );

  bool sidebarCollapsedFor(String userId) =>
      database.meta('sidebar_collapsed_$userId') == 'true';

  void setSidebarCollapsed(String userId, bool value) =>
      database.setMeta('sidebar_collapsed_$userId', value.toString());

  List<Map<String, Object?>> directoryUsers({
    String? role,
    bool includeInactive = true,
  }) {
    final where = <String>[];
    final args = <Object?>[];
    if (role != null) {
      where.add('role = ?');
      args.add(role);
    }
    if (!includeInactive) where.add('active = 1');
    return database.select(
      'SELECT * FROM user_directory ${where.isEmpty ? '' : 'WHERE ${where.join(' AND ')}'} ORDER BY name',
      args,
    );
  }

  void replaceDirectoryUsers(List<Map<String, dynamic>> users) {
    database.transaction(() {
      database.execute('DELETE FROM user_directory');
      for (final user in users) {
        database.execute(
          'INSERT INTO user_directory (id, name, email, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            user['id'],
            user['name'],
            user['email'],
            user['role'],
            user['active'] == true || user['active'] == 1 ? 1 : 0,
            user['created_at'],
            user['updated_at'],
          ],
        );
      }
    });
  }
}
