import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';

import '../../core/database/local_repository.dart';
import '../../core/models/models.dart';
import '../../core/reports/report_service.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_controller.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});
  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  ReportType type = ReportType.institutional;
  String? classId;
  String? studentId;
  String? professorId;
  String search = '';
  Timer? debounce;
  DateTime from = DateTime.now().subtract(const Duration(days: 90));
  DateTime to = DateTime.now();
  bool busy = false;

  @override
  void dispose() {
    debounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 700;
    final user = context.watch<AuthController>().session!;
    final repository = context.read<LocalRepository>();
    final allClasses = repository.classes(user, teacherId: professorId);
    final term = search.trim().toLowerCase();
    final classes = type == ReportType.student
        ? allClasses
        : allClasses
              .where(
                (item) =>
                    term.isEmpty ||
                    '${item.name} ${item.courseName}'.toLowerCase().contains(
                      term,
                    ),
              )
              .toList();
    final professors = repository.directoryUsers(
      role: 'professor',
      includeInactive: false,
    );
    final requiresClass =
        type == ReportType.course ||
        type == ReportType.classDiary ||
        type == ReportType.student;
    if (classId != null && !classes.any((item) => item.id == classId)) {
      classId = null;
    }
    if (requiresClass && classId == null && classes.isNotEmpty) {
      classId = classes.first.id;
    }
    final students = classId == null
        ? <Student>[]
        : repository.students(classId!, search: search, teacherId: professorId);
    if (studentId != null &&
        !students.any((student) => student.id == studentId)) {
      studentId = null;
    }
    return ListView(
      padding: EdgeInsets.all(compact ? 16 : 24),
      children: [
        Text(
          'Central de relatórios',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
            color: ItbColors.navy,
          ),
        ),
        const SizedBox(height: 20),
        Card(
          child: Padding(
            padding: EdgeInsets.all(compact ? 16 : 22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    SizedBox(
                      width: compact ? double.infinity : 300,
                      child: DropdownButtonFormField<ReportType>(
                        initialValue: type,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: 'Tipo de relatório',
                        ),
                        items: [
                          for (final item in ReportType.values)
                            DropdownMenuItem(
                              value: item,
                              child: Text(item.label),
                            ),
                        ],
                        onChanged: (value) => setState(() => type = value!),
                      ),
                    ),
                    if (type != ReportType.institutional)
                      SizedBox(
                        width: compact ? double.infinity : 300,
                        child: TextField(
                          decoration: const InputDecoration(
                            prefixIcon: Icon(Icons.search),
                            labelText: 'Buscar turma ou aluno',
                          ),
                          onChanged: (value) {
                            debounce?.cancel();
                            debounce = Timer(
                              const Duration(milliseconds: 350),
                              () {
                                if (mounted) setState(() => search = value);
                              },
                            );
                          },
                        ),
                      ),
                    if (user.role.canManage)
                      SizedBox(
                        width: compact ? double.infinity : 280,
                        child: DropdownButtonFormField<String?>(
                          initialValue: professorId,
                          isExpanded: true,
                          decoration: const InputDecoration(
                            labelText: 'Professor',
                          ),
                          items: [
                            const DropdownMenuItem(
                              value: null,
                              child: Text('Todos os professores'),
                            ),
                            ...professors.map(
                              (item) => DropdownMenuItem(
                                value: item['id'] as String,
                                child: Text('${item['name']}'),
                              ),
                            ),
                          ],
                          onChanged: (value) => setState(() {
                            professorId = value;
                            classId = null;
                            studentId = null;
                          }),
                        ),
                      ),
                    if (type != ReportType.institutional)
                      SizedBox(
                        width: compact ? double.infinity : 280,
                        child: DropdownButtonFormField<String?>(
                          initialValue: classId,
                          isExpanded: true,
                          decoration: const InputDecoration(
                            labelText: 'Turma / escopo',
                          ),
                          items: [
                            if (type == ReportType.dropoutRisk)
                              const DropdownMenuItem(
                                value: null,
                                child: Text('Todas as turmas'),
                              ),
                            for (final item in classes)
                              DropdownMenuItem(
                                value: item.id,
                                child: Text(item.name),
                              ),
                          ],
                          onChanged: (value) => setState(() {
                            classId = value;
                            studentId = null;
                          }),
                        ),
                      ),
                    if (type == ReportType.student)
                      SizedBox(
                        width: compact ? double.infinity : 280,
                        child: DropdownButtonFormField<String>(
                          initialValue: studentId,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Aluno'),
                          items: [
                            for (final item in students)
                              DropdownMenuItem(
                                value: item.id,
                                child: Text(item.name),
                              ),
                          ],
                          onChanged: (value) =>
                              setState(() => studentId = value),
                        ),
                      ),
                    ...[
                      OutlinedButton.icon(
                        onPressed: () => _date(true),
                        icon: const Icon(Icons.event),
                        label: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 15),
                          child: Text(
                            'De ${DateFormat('dd/MM/yy').format(from)}',
                          ),
                        ),
                      ),
                      OutlinedButton.icon(
                        onPressed: () => _date(false),
                        icon: const Icon(Icons.event_available),
                        label: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 15),
                          child: Text(
                            'Até ${DateFormat('dd/MM/yy').format(to)}',
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 24),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    FilledButton.icon(
                      onPressed: busy ? null : () => _generate(false),
                      icon: const Icon(Icons.picture_as_pdf_outlined),
                      label: const Text('Exportar PDF'),
                    ),
                    OutlinedButton.icon(
                      onPressed: busy ? null : () => _generate(true),
                      icon: const Icon(Icons.print_outlined),
                      label: const Text('Imprimir'),
                    ),
                    if (busy) ...[const CircularProgressIndicator()],
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _date(bool initial) async {
    final value = await showDatePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
      initialDate: initial ? from : to,
    );
    if (value != null) {
      setState(() {
        if (initial) {
          from = value;
        } else {
          to = value;
        }
      });
    }
  }

  Future<void> _generate(bool print) async {
    final user = context.read<AuthController>().session!;
    if (type == ReportType.student && studentId == null) {
      _message('Selecione um aluno.');
      return;
    }
    if ((type == ReportType.course ||
            type == ReportType.classDiary ||
            type == ReportType.student) &&
        classId == null) {
      _message('Selecione uma turma.');
      return;
    }
    if (from.isAfter(to)) {
      _message('A data inicial deve ser anterior à data final.');
      return;
    }
    setState(() => busy = true);
    try {
      final bytes = await context.read<ReportService>().build(
        ReportRequest(
          type: type,
          user: user,
          classId: classId,
          studentId: studentId,
          professorId: professorId,
          from: from,
          to: to,
        ),
      );
      final filename =
          'itb_${type.name}_${DateFormat('yyyyMMdd_HHmm').format(DateTime.now())}.pdf';
      if (print) {
        await Printing.layoutPdf(name: filename, onLayout: (_) async => bytes);
      } else {
        await Printing.sharePdf(bytes: bytes, filename: filename);
      }
    } catch (error) {
      _message('$error');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void _message(String value) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(value)));
}
