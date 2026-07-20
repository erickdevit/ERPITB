import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:flutter/services.dart';

import '../database/local_database.dart';
import '../models/models.dart';

enum ReportType {
  institutional('Consolidado institucional'),
  course('Sintético por curso'),
  classDiary('Diário de classe'),
  student('Ficha detalhada do aluno'),
  dropoutRisk('Risco de evasão');

  const ReportType(this.label);
  final String label;
}

class ReportRequest {
  const ReportRequest({
    required this.type,
    required this.user,
    this.classId,
    this.studentId,
    this.professorId,
    this.from,
    this.to,
  });
  final ReportType type;
  final UserSession user;
  final String? classId;
  final String? studentId;
  final String? professorId;
  final DateTime? from;
  final DateTime? to;
}

class ReportService {
  ReportService(this.database);
  final LocalDatabase database;
  String? _logoSvg;
  pw.ThemeData? _pdfTheme;

  Future<Uint8List> build(ReportRequest request) async {
    try {
      _logoSvg = await rootBundle.loadString('assets/itb-logo.svg');
    } catch (_) {
      _logoSvg = null;
    }
    try {
      final regular = await rootBundle.load('assets/fonts/Roboto-Regular.ttf');
      final bold = await rootBundle.load('assets/fonts/Roboto-Bold.ttf');
      _pdfTheme = pw.ThemeData.withFont(
        base: pw.Font.ttf(regular),
        bold: pw.Font.ttf(bold),
      );
    } catch (_) {
      _pdfTheme = null;
    }
    final document = pw.Document(
      title: request.type.label,
      author: 'Instituto Transforma Brasil',
      theme: _pdfTheme,
    );
    switch (request.type) {
      case ReportType.institutional:
        _institutional(document, request);
      case ReportType.course:
        _course(document, request);
      case ReportType.classDiary:
        _classDiary(document, request);
      case ReportType.student:
        _student(document, request);
      case ReportType.dropoutRisk:
        _risk(document, request);
    }
    return document.save();
  }

  void _institutional(pw.Document document, ReportRequest request) {
    final data = institutionalData(request);
    final totals = data.totals;
    final courses = data.courses;
    document.addPage(
      _page(
        title: request.type.label,
        user: request.user,
        children: [
          pw.Row(
            children: [
              _metric('Matrículas ativas', '${totals['students']}'),
              pw.SizedBox(width: 12),
              _metric('Chamadas realizadas', '${totals['calls']}'),
              pw.SizedBox(width: 12),
              _metric(
                'Frequência média',
                '${(totals['rate'] as num).toStringAsFixed(1)}%',
              ),
            ],
          ),
          pw.SizedBox(height: 22),
          _table(
            ['Código', 'Curso', 'Turmas', 'Frequência'],
            [
              for (final row in courses)
                [
                  '${row['code']}',
                  '${row['name']}',
                  '${row['classes']}',
                  '${row['rate']}%',
                ],
            ],
          ),
        ],
      ),
    );
  }

  ({Map<String, Object?> totals, List<Map<String, Object?>> courses})
  institutionalData(ReportRequest request) {
    final from = DateFormat(
      'yyyy-MM-dd',
    ).format(request.from ?? DateTime(2000));
    final to = DateFormat('yyyy-MM-dd').format(request.to ?? DateTime.now());
    final professor = _effectiveProfessor(request);
    final teacherClause = professor == null
        ? ''
        : '''AND EXISTS (SELECT 1 FROM class_teachers ct_filter
               WHERE ct_filter.class_id = c.id AND ct_filter.user_id = ? AND ct_filter.deleted_at IS NULL)''';
    final studentCount = database
        .select(
          '''SELECT COUNT(DISTINCT e.student_id) AS students
               FROM classes c JOIN enrollments e ON e.class_id = c.id AND e.deleted_at IS NULL
               JOIN students s ON s.id = e.student_id AND s.active = 1 AND s.deleted_at IS NULL
              WHERE c.deleted_at IS NULL $teacherClause''',
          [?professor],
        )
        .first;
    final attendanceTotals = database
        .select(
          '''SELECT COUNT(DISTINCT a.class_id || ':' || a.date) AS calls,
                    COALESCE(100.0 * SUM(CASE WHEN a.status = 'P' THEN 1 ELSE 0 END) / NULLIF(COUNT(a.id), 0), 0) AS rate
               FROM attendance_records a JOIN classes c ON c.id = a.class_id
              WHERE a.deleted_at IS NULL AND a.date BETWEEN ? AND ? $teacherClause''',
          [from, to, ?professor],
        )
        .first;
    final totals = {...studentCount, ...attendanceTotals};
    final courses = database.select(
      '''SELECT co.code, co.name, COUNT(DISTINCT c.id) AS classes,
                COALESCE(ROUND(100.0 * SUM(CASE WHEN a.status = 'P' THEN 1 ELSE 0 END) / NULLIF(COUNT(a.id), 0), 1), 0) AS rate
           FROM courses co LEFT JOIN classes c ON c.course_id = co.id AND c.deleted_at IS NULL
           LEFT JOIN attendance_records a ON a.class_id = c.id AND a.deleted_at IS NULL AND a.date BETWEEN ? AND ?
          WHERE co.deleted_at IS NULL $teacherClause GROUP BY co.id, co.code, co.name ORDER BY co.name''',
      [from, to, ?professor],
    );
    return (totals: totals, courses: courses);
  }

  void _course(pw.Document document, ReportRequest request) {
    final classId = _required(request.classId, 'turma');
    _ensureClassInScope(request, classId);
    final course = database.select(
      'SELECT co.id, co.code, co.name FROM courses co JOIN classes c ON c.course_id = co.id WHERE c.id = ?',
      [classId],
    ).first;
    final rows = database.select(
      '''SELECT c.name, c.shift, COUNT(DISTINCT a.date) AS lessons,
                COALESCE(ROUND(100.0 * SUM(CASE WHEN a.status = 'P' THEN 1 ELSE 0 END) / NULLIF(COUNT(a.id), 0), 1), 0) AS rate
           FROM classes c LEFT JOIN attendance_records a ON a.class_id = c.id AND a.deleted_at IS NULL AND a.date BETWEEN ? AND ?
          WHERE c.course_id = ? AND c.deleted_at IS NULL ${_teacherClause(request, 'c')} GROUP BY c.id, c.name, c.shift ORDER BY c.name''',
      [
        DateFormat('yyyy-MM-dd').format(request.from ?? DateTime(2000)),
        DateFormat('yyyy-MM-dd').format(request.to ?? DateTime.now()),
        course['id'],
        if (_effectiveProfessor(request) != null) _effectiveProfessor(request),
      ],
    );
    document.addPage(
      _page(
        title: '${request.type.label} — ${course['name']}',
        user: request.user,
        children: [
          pw.Text(
            'Curso ${course['code']} • ${course['name']}',
            style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold),
          ),
          pw.SizedBox(height: 16),
          _table(
            ['Turma', 'Turno', 'Aulas', 'Frequência'],
            [
              for (final row in rows)
                [
                  '${row['name']}',
                  _shift('${row['shift']}'),
                  '${row['lessons']}',
                  '${row['rate']}%',
                ],
            ],
          ),
        ],
      ),
    );
  }

  void _classDiary(pw.Document document, ReportRequest request) {
    final classId = _required(request.classId, 'turma');
    _ensureClassInScope(request, classId);
    final info = database.select(
      'SELECT c.name, co.name AS course_name FROM classes c JOIN courses co ON co.id = c.course_id WHERE c.id = ?',
      [classId],
    ).first;
    final from = DateFormat(
      'yyyy-MM-dd',
    ).format(request.from ?? DateTime(2000));
    final to = DateFormat('yyyy-MM-dd').format(request.to ?? DateTime.now());
    final dates = database
        .select(
          'SELECT DISTINCT date FROM attendance_records WHERE class_id = ? AND date BETWEEN ? AND ? AND deleted_at IS NULL ORDER BY date LIMIT 31',
          [classId, from, to],
        )
        .map((row) => row['date']! as String)
        .toList();
    final students = database.select(
      'SELECT s.id, s.registration_number, s.name FROM students s JOIN enrollments e ON e.student_id = s.id WHERE e.class_id = ? AND e.deleted_at IS NULL ORDER BY s.name',
      [classId],
    );
    final records = database.select(
      'SELECT student_id, date, status FROM attendance_records WHERE class_id = ? AND date BETWEEN ? AND ? AND deleted_at IS NULL',
      [classId, from, to],
    );
    final byKey = {
      for (final row in records)
        '${row['student_id']}|${row['date']}': row['status'],
    };
    final headers = [
      'Matrícula',
      'Aluno',
      ...dates.map((date) => DateFormat('dd/MM').format(DateTime.parse(date))),
      'F',
      '%',
    ];
    final data = <List<String>>[];
    for (final student in students) {
      final statuses = [
        for (final date in dates) '${byKey['${student['id']}|$date'] ?? '—'}',
      ];
      final absences = statuses.where((status) => status == 'F').length;
      final present = statuses.where((status) => status == 'P').length;
      final total = statuses.where((status) => status != '—').length;
      data.add([
        '${student['registration_number']}',
        '${student['name']}',
        ...statuses,
        '$absences',
        total == 0 ? '—' : '${(present * 100 / total).toStringAsFixed(0)}%',
      ]);
    }
    document.addPage(
      _page(
        title: '${request.type.label} — ${info['name']}',
        user: request.user,
        landscape: true,
        children: [
          pw.Text(
            '${info['course_name']} • Período: ${_displayDate(from)} a ${_displayDate(to)}',
            style: const pw.TextStyle(fontSize: 9),
          ),
          pw.SizedBox(height: 12),
          _table(headers, data, fontSize: dates.length > 15 ? 5.5 : 7),
          pw.SizedBox(height: 8),
          pw.Text(
            'Legenda: P = Presença • F = Falta • J = Falta justificada',
            style: const pw.TextStyle(fontSize: 8),
          ),
        ],
      ),
    );
  }

  void _student(pw.Document document, ReportRequest request) {
    final studentId = _required(request.studentId, 'aluno');
    final selectedClass = _required(request.classId, 'turma');
    _ensureClassInScope(request, selectedClass);
    final student = database
        .select(
          '''SELECT s.*, c.name AS class_name, co.name AS course_name FROM students s
           JOIN enrollments e ON e.student_id = s.id JOIN classes c ON c.id = e.class_id JOIN courses co ON co.id = c.course_id
          WHERE s.id = ? AND (? IS NULL OR c.id = ?) LIMIT 1''',
          [studentId, request.classId, request.classId],
        )
        .first;
    final records = database.select(
      '''SELECT a.date, a.status, a.notes FROM attendance_records a
          WHERE a.student_id = ? AND (? IS NULL OR a.class_id = ?) AND a.deleted_at IS NULL AND a.date BETWEEN ? AND ? ORDER BY a.date DESC''',
      [
        studentId,
        request.classId,
        request.classId,
        DateFormat('yyyy-MM-dd').format(request.from ?? DateTime(2000)),
        DateFormat('yyyy-MM-dd').format(request.to ?? DateTime.now()),
      ],
    );
    final present = records.where((row) => row['status'] == 'P').length;
    final rate = records.isEmpty ? 0.0 : present * 100 / records.length;
    document.addPage(
      _page(
        title: request.type.label,
        user: request.user,
        children: [
          pw.Text(
            '${student['name']}',
            style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold),
          ),
          pw.Text(
            'Matrícula ${student['registration_number']} • ${student['course_name']} / ${student['class_name']}',
          ),
          pw.SizedBox(height: 14),
          pw.Row(
            children: [
              _metric('Frequência', '${rate.toStringAsFixed(1)}%'),
              pw.SizedBox(width: 12),
              _metric('Registros', '${records.length}'),
            ],
          ),
          pw.SizedBox(height: 18),
          _table(
            ['Data', 'Status', 'Observações'],
            [
              for (final row in records)
                [
                  _displayDate('${row['date']}'),
                  _status('${row['status']}'),
                  '${row['notes'] ?? '—'}',
                ],
            ],
          ),
        ],
      ),
    );
  }

  void _risk(pw.Document document, ReportRequest request) {
    final classFilter = request.classId == null ? '' : 'AND a.class_id = ?';
    final args = <Object?>[
      DateFormat('yyyy-MM-dd').format(request.from ?? DateTime(2000)),
      DateFormat('yyyy-MM-dd').format(request.to ?? DateTime.now()),
      if (request.classId != null) request.classId,
      if (_effectiveProfessor(request) != null) _effectiveProfessor(request),
    ];
    final records = database.select(
      '''SELECT s.id, s.registration_number, s.name, c.id AS class_id, c.name AS class_name,
                a.date, a.status
           FROM students s JOIN attendance_records a ON a.student_id = s.id
           JOIN classes c ON c.id = a.class_id WHERE a.deleted_at IS NULL AND a.date BETWEEN ? AND ? $classFilter ${_teacherClause(request, 'c')}
          ORDER BY s.id, c.id, a.date''',
      args,
    );
    final groups = <String, Map<String, Object?>>{};
    for (final record in records) {
      final key = '${record['id']}|${record['class_id']}';
      final group = groups.putIfAbsent(
        key,
        () => {
          'registration_number': record['registration_number'],
          'name': record['name'],
          'class_name': record['class_name'],
          'total': 0,
          'present': 0,
          'absences': 0,
          'streak': 0,
          'max_streak': 0,
        },
      );
      group['total'] = (group['total']! as int) + 1;
      if (record['status'] == 'P') {
        group['present'] = (group['present']! as int) + 1;
      }
      if (record['status'] == 'F') {
        group['absences'] = (group['absences']! as int) + 1;
        group['streak'] = (group['streak']! as int) + 1;
        if ((group['streak']! as int) > (group['max_streak']! as int)) {
          group['max_streak'] = group['streak'];
        }
      } else {
        group['streak'] = 0;
      }
    }
    final rows =
        groups.values
            .map((group) {
              final rate =
                  (group['present']! as int) * 100 / (group['total']! as int);
              return {
                ...group,
                'rate': rate,
                'reason': rate < 75 ? 'Frequência <75%' : '3+ faltas seguidas',
              };
            })
            .where(
              (group) =>
                  (group['rate']! as double) < 75 ||
                  (group['max_streak']! as int) >= 3,
            )
            .toList()
          ..sort(
            (left, right) =>
                (left['rate']! as double).compareTo(right['rate']! as double),
          );
    document.addPage(
      _page(
        title: request.type.label,
        user: request.user,
        children: [
          pw.Container(
            padding: const pw.EdgeInsets.all(10),
            color: PdfColor.fromHex('#FFF3E0'),
            child: pw.Text(
              'Critérios: frequência inferior a 75% ou três faltas não justificadas consecutivas.',
              style: const pw.TextStyle(fontSize: 9),
            ),
          ),
          pw.SizedBox(height: 14),
          _table(
            ['Matrícula', 'Aluno', 'Turma', 'Faltas', 'Frequência', 'Motivo'],
            [
              for (final row in rows)
                [
                  '${row['registration_number']}',
                  '${row['name']}',
                  '${row['class_name']}',
                  '${row['absences']}',
                  '${(row['rate']! as double).toStringAsFixed(1)}%',
                  '${row['reason']}',
                ],
            ],
          ),
        ],
      ),
    );
  }

  pw.MultiPage _page({
    required String title,
    required UserSession user,
    required List<pw.Widget> children,
    bool landscape = false,
  }) => pw.MultiPage(
    pageFormat: landscape ? PdfPageFormat.a4.landscape : PdfPageFormat.a4,
    margin: const pw.EdgeInsets.all(32),
    header: (_) => pw.Column(
      children: [
        pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          children: [
            pw.Row(
              children: [
                if (_logoSvg != null)
                  pw.SvgImage(svg: _logoSvg!, width: 38, height: 38)
                else
                  pw.Container(
                    width: 38,
                    height: 38,
                    alignment: pw.Alignment.center,
                    color: PdfColor.fromHex('#37C5F3'),
                    child: pw.Text(
                      'ITB',
                      style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
                    ),
                  ),
                pw.SizedBox(width: 10),
                pw.Text(
                  'INSTITUTO TRANSFORMA BRASIL',
                  style: pw.TextStyle(
                    fontWeight: pw.FontWeight.bold,
                    color: PdfColor.fromHex('#102A43'),
                  ),
                ),
              ],
            ),
            pw.Text(
              DateFormat('dd/MM/yyyy HH:mm').format(DateTime.now()),
              style: const pw.TextStyle(fontSize: 8),
            ),
          ],
        ),
        pw.Divider(color: PdfColor.fromHex('#29B6C8')),
        pw.SizedBox(height: 6),
        pw.Align(
          alignment: pw.Alignment.centerLeft,
          child: pw.Text(
            title,
            style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold),
          ),
        ),
        pw.SizedBox(height: 14),
      ],
    ),
    footer: (context) => pw.Row(
      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
      children: [
        pw.Text(
          'Gerado por ${user.name}',
          style: const pw.TextStyle(fontSize: 8),
        ),
        pw.Text(
          'Página ${context.pageNumber} de ${context.pagesCount}',
          style: const pw.TextStyle(fontSize: 8),
        ),
      ],
    ),
    build: (_) => children,
  );

  pw.Widget _metric(String label, String value) => pw.Expanded(
    child: pw.Container(
      padding: const pw.EdgeInsets.all(14),
      decoration: pw.BoxDecoration(
        border: pw.Border.all(color: PdfColor.fromHex('#D9E2EC')),
        borderRadius: pw.BorderRadius.circular(8),
      ),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Text(
            value,
            style: pw.TextStyle(
              fontSize: 18,
              fontWeight: pw.FontWeight.bold,
              color: PdfColor.fromHex('#1769AA'),
            ),
          ),
          pw.SizedBox(height: 3),
          pw.Text(label, style: const pw.TextStyle(fontSize: 9)),
        ],
      ),
    ),
  );

  pw.Widget _table(
    List<String> headers,
    List<List<String>> data, {
    double fontSize = 8,
  }) => pw.TableHelper.fromTextArray(
    headers: headers,
    data: data,
    headerStyle: pw.TextStyle(
      fontWeight: pw.FontWeight.bold,
      color: PdfColors.white,
      fontSize: fontSize,
    ),
    headerDecoration: pw.BoxDecoration(color: PdfColor.fromHex('#1769AA')),
    cellStyle: pw.TextStyle(fontSize: fontSize),
    cellPadding: const pw.EdgeInsets.all(5),
    border: pw.TableBorder.all(color: PdfColor.fromHex('#D9E2EC'), width: .5),
    oddRowDecoration: pw.BoxDecoration(color: PdfColor.fromHex('#F4F7FA')),
  );

  String _required(String? value, String field) {
    if (value == null) {
      throw StateError('Selecione $field para gerar este relatório.');
    }
    return value;
  }

  String? _effectiveProfessor(ReportRequest request) =>
      request.professorId ??
      (request.user.role == UserRole.professor ? request.user.id : null);

  String _teacherClause(ReportRequest request, String classAlias) =>
      _effectiveProfessor(request) == null
      ? ''
      : 'AND EXISTS (SELECT 1 FROM class_teachers ct_filter WHERE ct_filter.class_id = $classAlias.id AND ct_filter.user_id = ? AND ct_filter.deleted_at IS NULL)';

  void _ensureClassInScope(ReportRequest request, String classId) {
    final professor = _effectiveProfessor(request);
    if (professor == null) return;
    final allowed = database.select(
      'SELECT 1 FROM class_teachers WHERE class_id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1',
      [classId, professor],
    );
    if (allowed.isEmpty) {
      throw StateError('A turma não pertence ao professor selecionado.');
    }
  }

  String _shift(String value) =>
      {
        'manha': 'Manhã',
        'tarde': 'Tarde',
        'noite': 'Noite',
        'integral': 'Integral',
      }[value] ??
      value;
  String _status(String value) =>
      {
        'P': 'Presente',
        'F': 'Falta',
        'J': 'Justificada',
        'A': 'Atraso',
      }[value] ??
      value;
  String _displayDate(String value) =>
      DateFormat('dd/MM/yyyy').format(DateTime.parse(value));
}
