enum UserRole {
  admin,
  pedagogico,
  professor;

  static UserRole parse(String value) => UserRole.values.firstWhere(
    (role) => role.name == value,
    orElse: () => throw FormatException('Perfil inválido: $value'),
  );

  String get label => switch (this) {
    UserRole.admin => 'Administrador',
    UserRole.pedagogico => 'Administrativo / Secretaria',
    UserRole.professor => 'Professor',
  };

  bool get canManage => this != UserRole.professor;
  bool get canResolveConflicts => this != UserRole.professor;
}

class UserSession {
  const UserSession({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
  });

  final String id;
  final String name;
  final String email;
  final UserRole role;

  factory UserSession.fromJson(Map<String, dynamic> json) => UserSession(
    id: json['id'] as String,
    name: json['name'] as String,
    email: json['email'] as String,
    role: UserRole.parse(json['role'] as String),
  );

  Map<String, Object?> toJson() => {
    'id': id,
    'name': name,
    'email': email,
    'role': role.name,
  };
}

class Laboratory {
  const Laboratory({
    required this.id,
    required this.name,
    this.active = true,
  });

  final String id;
  final String name;
  final bool active;

  factory Laboratory.fromMap(Map<String, Object?> map) => Laboratory(
        id: map['id']! as String,
        name: map['name']! as String,
        active: (map['active'] as num?) == 1,
      );

  Map<String, Object?> toMap() => {
        'id': id,
        'name': name,
        'active': active ? 1 : 0,
      };
}

class ClassSummary {
  const ClassSummary({
    required this.id,
    required this.courseId,
    required this.name,
    required this.shift,
    required this.courseName,
    this.weekDay,
    this.isKids = false,
    this.laboratoryId,
    this.laboratoryName,
    this.teacherId,
    this.teacherName,
    this.attendanceRate = 0,
  });

  final String id;
  final String courseId;
  final String name;
  final String shift;
  final String courseName;
  final String? weekDay;
  final bool isKids;
  final String? laboratoryId;
  final String? laboratoryName;
  final String? teacherId;
  final String? teacherName;
  final double attendanceRate;

  factory ClassSummary.fromMap(Map<String, Object?> map) => ClassSummary(
    id: map['id']! as String,
    courseId: map['course_id']! as String,
    name: map['name']! as String,
    shift: map['shift']! as String,
    courseName: (map['course_name'] ?? '') as String,
    weekDay: map['week_day'] as String?,
    isKids: (map['is_kids'] as num?) == 1,
    laboratoryId: map['laboratory_id'] as String?,
    laboratoryName: map['laboratory_name'] as String?,
    teacherId: map['teacher_id'] as String?,
    teacherName: map['teacher_name'] as String?,
    attendanceRate: (map['attendance_rate'] as num?)?.toDouble() ?? 0,
  );
}

class Student {
  const Student({
    required this.id,
    required this.name,
    required this.registrationNumber,
    this.cpf,
    this.contact,
    this.birthDate,
    this.registrationDate,
    this.classId,
    this.className,
    this.enrollmentStatus = 'ativa',
  });

  final String id;
  final String name;
  final String registrationNumber;
  final String? cpf;
  final String? contact;
  final DateTime? birthDate;
  final DateTime? registrationDate;
  final String? classId;
  final String? className;
  final String enrollmentStatus;

  factory Student.fromMap(Map<String, Object?> map) => Student(
    id: map['id']! as String,
    name: map['name']! as String,
    registrationNumber: map['registration_number']! as String,
    cpf: map['cpf'] as String?,
    contact: map['contact'] as String?,
    birthDate: map['birth_date'] == null
        ? null
        : DateTime.tryParse(map['birth_date']! as String),
    registrationDate: map['created_at'] == null
        ? null
        : DateTime.tryParse(map['created_at']! as String),
    classId: map['class_id'] as String?,
    className: map['class_name'] as String?,
    enrollmentStatus: (map['enrollment_status'] ?? 'ativa') as String,
  );
}

enum AttendanceStatus {
  present('P', 'Presente'),
  absent('F', 'Falta'),
  justified('J', 'Justificada'),
  delayed('A', 'Atraso'),
  replacement('R', 'Reposição');

  const AttendanceStatus(this.code, this.label);
  final String code;
  final String label;

  static AttendanceStatus fromCode(String value) =>
      AttendanceStatus.values.firstWhere((status) => status.code == value);
}

class ReplacementItem {
  const ReplacementItem({
    required this.recordId,
    required this.studentId,
    required this.studentName,
    required this.registrationNumber,
    required this.classId,
    required this.className,
    required this.date,
    this.notes,
  });

  final String recordId;
  final String studentId;
  final String studentName;
  final String registrationNumber;
  final String classId;
  final String className;
  final DateTime date;
  final String? notes;

  factory ReplacementItem.fromMap(Map<String, Object?> map) => ReplacementItem(
        recordId: map['id']! as String,
        studentId: map['student_id']! as String,
        studentName: (map['student_name'] ?? '') as String,
        registrationNumber: (map['registration_number'] ?? '') as String,
        classId: map['class_id']! as String,
        className: (map['class_name'] ?? '') as String,
        date: DateTime.parse(map['date']! as String),
        notes: map['notes'] as String?,
      );
}

class AttendanceDraft {
  const AttendanceDraft({
    required this.student,
    required this.status,
    this.notes,
  });

  final Student student;
  final AttendanceStatus status;
  final String? notes;

  AttendanceDraft copyWith({AttendanceStatus? status, String? notes}) =>
      AttendanceDraft(
        student: student,
        status: status ?? this.status,
        notes: notes ?? this.notes,
      );
}

class DashboardData {
  const DashboardData({
    required this.globalRate,
    required this.present,
    required this.absent,
    required this.justified,
    required this.delayed,
    required this.byClass,
    required this.evolution,
    required this.riskStudents,
    required this.topAbsentees,
    required this.teacherWorkload,
  });

  final double globalRate;
  final int present;
  final int absent;
  final int justified;
  final int delayed;
  final List<ClassSummary> byClass;
  final List<({DateTime date, double rate})> evolution;
  final int riskStudents;
  final List<AbsenteeSummary> topAbsentees;
  final List<TeacherWorkload> teacherWorkload;
}

class AbsenteeSummary {
  const AbsenteeSummary({
    required this.name,
    required this.registrationNumber,
    required this.absences,
    required this.attendanceRate,
  });
  final String name;
  final String registrationNumber;
  final int absences;
  final double attendanceRate;
}

class TeacherWorkload {
  const TeacherWorkload({
    required this.name,
    required this.classes,
    required this.students,
  });
  final String name;
  final int classes;
  final int students;
}
