import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/database/local_repository.dart';
import '../../core/models/models.dart';
import '../../core/sync/sync_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/itb_components.dart';
import '../auth/auth_controller.dart';

class StudentsScreen extends StatefulWidget {
  const StudentsScreen({super.key});
  @override
  State<StudentsScreen> createState() => _StudentsScreenState();
}

class _StudentsScreenState extends State<StudentsScreen> {
  String? classId;
  String? performance;
  String? status = 'ativa';
  String? teacherId;
  String search = '';
  Timer? debounce;

  @override
  void dispose() {
    debounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 700;
    context.watch<SyncService>();
    final user = context.watch<AuthController>().session!;
    final repository = context.read<LocalRepository>();
    final classes = repository.classes(user);
    final professors = repository.directoryUsers(
      role: 'professor',
      includeInactive: false,
    );
    final students = repository.students(
      classId,
      performance: performance,
      enrollmentStatus: status,
      search: search,
      teacherId: teacherId,
    );

    return ListView(
      padding: EdgeInsets.all(compact ? 16 : 24),
      children: [
        ItbPageHeader(
          title: 'Alunos',
          subtitle: 'Cadastro, matrículas e histórico de alunos',
          action: user.role.canManage
              ? FilledButton.icon(
                  onPressed: classes.isEmpty
                      ? null
                      : () => _studentDialog(
                          repository,
                          classId ?? classes.first.id,
                        ),
                  icon: const Icon(Icons.person_add_alt_1, size: 18),
                  label: const Text('Novo aluno'),
                )
              : null,
        ),
        const SizedBox(height: 16),
        ItbFilterCard(
          searchHint: 'Buscar aluno ou matrícula',
          searchValue: search,
          onSearchChanged: (value) => setState(() => search = value),
          filters: [
            SizedBox(
              width: compact ? double.infinity : 240,
              child: DropdownButtonFormField<String?>(
                initialValue: classId,
                isExpanded: true,
                decoration: const InputDecoration(
                  isDense: true,
                  labelText: 'Turma',
                ),
                items: [
                  const DropdownMenuItem(
                    value: null,
                    child: Text('Todas as turmas'),
                  ),
                  for (final item in classes)
                    DropdownMenuItem(value: item.id, child: Text(item.name)),
                ],
                onChanged: (value) => setState(() => classId = value),
              ),
            ),
            if (user.role.canManage)
              SizedBox(
                width: compact ? double.infinity : 240,
                child: DropdownButtonFormField<String?>(
                  initialValue: teacherId,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    isDense: true,
                    labelText: 'Professor',
                  ),
                  items: [
                    const DropdownMenuItem(
                      value: null,
                      child: Text('Todos os professores'),
                    ),
                    ...professors.map(
                      (p) => DropdownMenuItem(
                        value: p['id'] as String,
                        child: Text('${p['name']}'),
                      ),
                    ),
                  ],
                  onChanged: (value) => setState(() => teacherId = value),
                ),
              ),
            SizedBox(
              width: compact ? double.infinity : 190,
              child: DropdownButtonFormField<String?>(
                initialValue: performance,
                isExpanded: true,
                decoration: const InputDecoration(
                  isDense: true,
                  labelText: 'Desempenho',
                ),
                items: const [
                  DropdownMenuItem(value: null, child: Text('Todos')),
                  DropdownMenuItem(
                    value: 'critical',
                    child: Text('Crítico (<75%)'),
                  ),
                  DropdownMenuItem(
                    value: 'attention',
                    child: Text('Atenção (75–85%)'),
                  ),
                  DropdownMenuItem(
                    value: 'regular',
                    child: Text('Regular (>85%)'),
                  ),
                ],
                onChanged: (value) => setState(() => performance = value),
              ),
            ),
            SizedBox(
              width: compact ? double.infinity : 170,
              child: DropdownButtonFormField<String?>(
                initialValue: status,
                isExpanded: true,
                decoration: const InputDecoration(
                  isDense: true,
                  labelText: 'Matrícula',
                ),
                items: const [
                  DropdownMenuItem(value: null, child: Text('Todos os alunos')),
                  DropdownMenuItem(value: 'ativa', child: Text('Ativa')),
                  DropdownMenuItem(value: 'trancada', child: Text('Trancada')),
                  DropdownMenuItem(
                    value: 'concluida',
                    child: Text('Concluída'),
                  ),
                ],
                onChanged: (value) => setState(() => status = value),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (students.isEmpty)
          const Card(
            child: ItbEmptyState(
              title: 'Nenhum aluno encontrado',
              subtitle: 'Tente ajustar os filtros ou cadastrar novos alunos.',
              icon: Icons.school_outlined,
            ),
          )
        else if (compact)
          Column(
            key: const Key('mobile-student-list'),
            children: [
              for (final student in students)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _MobileStudentCard(
                    student: student,
                    canManage: user.role.canManage,
                    isAdmin: user.role == UserRole.admin,
                    onEdit: () => _studentDialog(
                      repository,
                      student.classId ?? classId ?? classes.first.id,
                      student: student,
                    ),
                    onRemove: () => user.role == UserRole.admin
                        ? _delete(repository, student)
                        : _inactivate(repository, student),
                  ),
                ),
            ],
          )
        else
          Card(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  columns: [
                    const DataColumn(label: Text('Matrícula')),
                    const DataColumn(label: Text('Nome')),
                    const DataColumn(label: Text('Turma')),
                    const DataColumn(label: Text('Nascimento')),
                    const DataColumn(label: Text('Cadastro')),
                    const DataColumn(label: Text('Contato')),
                    const DataColumn(label: Text('Situação')),
                    if (user.role.canManage)
                      const DataColumn(label: Text('Ações')),
                  ],
                  rows: [
                    for (final student in students)
                      DataRow(
                        cells: [
                          DataCell(
                            Text(
                              student.registrationNumber,
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            ),
                          ),
                          DataCell(
                            Text(
                              student.name,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                color: ItbColors.navy,
                              ),
                            ),
                          ),
                          DataCell(Text(student.className ?? '—')),
                          DataCell(
                            Text(
                              student.birthDate == null
                                  ? '—'
                                  : DateFormat(
                                      'dd/MM/yyyy',
                                    ).format(student.birthDate!),
                            ),
                          ),
                          DataCell(
                            Text(
                              student.registrationDate == null
                                  ? '—'
                                  : DateFormat('dd/MM/yyyy').format(
                                      student.registrationDate!.toLocal(),
                                    ),
                            ),
                          ),
                          DataCell(Text(student.contact ?? '—')),
                          DataCell(
                            ItbStatusBadge.enrollment(student.enrollmentStatus),
                          ),
                          if (user.role.canManage)
                            DataCell(
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  IconButton(
                                    tooltip: 'Editar',
                                    onPressed: () => _studentDialog(
                                      repository,
                                      student.classId ??
                                          classId ??
                                          classes.first.id,
                                      student: student,
                                    ),
                                    icon: const Icon(
                                      Icons.edit_outlined,
                                      size: 19,
                                    ),
                                  ),
                                  if (user.role == UserRole.admin)
                                    IconButton(
                                      tooltip: 'Excluir aluno',
                                      onPressed: () =>
                                          _delete(repository, student),
                                      icon: const Icon(
                                        Icons.delete_outline,
                                        color: ItbColors.red,
                                        size: 19,
                                      ),
                                    )
                                  else
                                    IconButton(
                                      tooltip: 'Inativar',
                                      onPressed: () =>
                                          _inactivate(repository, student),
                                      icon: const Icon(
                                        Icons.person_off_outlined,
                                        size: 19,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }

  Future<void> _studentDialog(
    LocalRepository repository,
    String targetClassId, {
    Student? student,
  }) async {
    final availableClasses = repository.classes(
      context.read<AuthController>().session!,
    );
    var selectedClassId = student?.classId ?? targetClassId;
    var studentName = student?.name ?? '';
    var registrationNumber = student?.registrationNumber ?? '';
    var studentCpf = student?.cpf ?? '';
    var studentContact = student?.contact ?? '';
    DateTime? birthDate = student?.birthDate;
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, refresh) => AlertDialog(
          title: Text(student == null ? 'Novo aluno' : 'Editar aluno'),
          content: SizedBox(
            width: 480,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: selectedClassId,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Turma *'),
                    items: availableClasses
                        .map(
                          (item) => DropdownMenuItem(
                            value: item.id,
                            child: Text('${item.name} • ${item.courseName}'),
                          ),
                        )
                        .toList(),
                    onChanged: (value) => selectedClassId = value!,
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    initialValue: studentName,
                    onChanged: (value) => studentName = value,
                    decoration: const InputDecoration(
                      labelText: 'Nome completo',
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    initialValue: registrationNumber,
                    onChanged: (value) => registrationNumber = value,
                    decoration: const InputDecoration(labelText: 'Matrícula'),
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    initialValue: studentCpf,
                    onChanged: (value) => studentCpf = value,
                    decoration: const InputDecoration(labelText: 'CPF'),
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    initialValue: studentContact,
                    onChanged: (value) => studentContact = value,
                    decoration: const InputDecoration(labelText: 'Contato'),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: () async {
                      final value = await showDatePicker(
                        context: context,
                        initialDate: birthDate ?? DateTime(2005),
                        firstDate: DateTime(1940),
                        lastDate: DateTime.now(),
                      );
                      if (value != null) refresh(() => birthDate = value);
                    },
                    icon: const Icon(Icons.cake_outlined, size: 18),
                    label: Text(
                      birthDate == null
                          ? 'Data de nascimento'
                          : DateFormat('dd/MM/yyyy').format(birthDate!),
                    ),
                  ),
                  if (student?.registrationDate != null) ...[
                    const SizedBox(height: 10),
                    TextFormField(
                      initialValue: DateFormat(
                        'dd/MM/yyyy HH:mm',
                      ).format(student!.registrationDate!.toLocal()),
                      enabled: false,
                      decoration: const InputDecoration(
                        prefixIcon: Icon(Icons.event_available_outlined),
                        labelText: 'Data de cadastro',
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Salvar'),
            ),
          ],
        ),
      ),
    );
    if (saved == true &&
        studentName.trim().length >= 2 &&
        registrationNumber.trim().length >= 2) {
      if (student == null) {
        repository.createStudent(
          classId: selectedClassId,
          name: studentName,
          registrationNumber: registrationNumber,
          cpf: studentCpf,
          contact: studentContact,
          birthDate: birthDate,
        );
      } else {
        repository.updateStudent(
          id: student.id,
          name: studentName,
          registrationNumber: registrationNumber,
          cpf: studentCpf,
          contact: studentContact,
          birthDate: birthDate,
        );
        if (student.classId != selectedClassId) {
          repository.moveStudent(
            studentId: student.id,
            classId: selectedClassId,
          );
        }
      }
      if (mounted) {
        setState(() {});
        context.read<SyncService>().synchronize();
      }
    }
  }

  Future<void> _inactivate(LocalRepository repository, Student student) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Inativar aluno?'),
        content: Text(
          '${student.name} deixará de aparecer como ativo, mas o histórico será preservado.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Inativar'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      repository.inactivateStudent(student.id);
      if (mounted) {
        setState(() {});
        context.read<SyncService>().synchronize();
      }
    }
  }

  Future<void> _delete(LocalRepository repository, Student student) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Excluir aluno?'),
        content: Text(
          '${student.name} será removido das listagens e da turma. O histórico já registrado será preservado.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: ItbColors.red),
            child: const Text('Excluir'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      repository.deleteStudent(student.id);
      if (mounted) {
        setState(() {});
        context.read<SyncService>().synchronize();
      }
    }
  }
}

class _MobileStudentCard extends StatelessWidget {
  const _MobileStudentCard({
    required this.student,
    required this.canManage,
    required this.isAdmin,
    required this.onEdit,
    required this.onRemove,
  });

  final Student student;
  final bool canManage;
  final bool isAdmin;
  final VoidCallback onEdit;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: ItbColors.blueLight,
                  borderRadius: BorderRadius.circular(10),
                ),
                alignment: Alignment.center,
                child: Text(
                  student.name.substring(0, 1).toUpperCase(),
                  style: const TextStyle(
                    color: ItbColors.blue,
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      student.name,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        color: ItbColors.navy,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Matrícula ${student.registrationNumber}',
                      style: const TextStyle(
                        color: ItbColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              ItbStatusBadge.enrollment(student.enrollmentStatus),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'Turma: ${student.className ?? '—'}',
            style: const TextStyle(fontSize: 13),
          ),
          const SizedBox(height: 4),
          Text(
            'Nascimento: ${student.birthDate == null ? '—' : DateFormat('dd/MM/yyyy').format(student.birthDate!)}',
            style: const TextStyle(fontSize: 13),
          ),
          if ((student.contact ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              'Contato: ${student.contact}',
              style: const TextStyle(fontSize: 13),
            ),
          ],
          if (canManage) ...[
            const Divider(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton.icon(
                  onPressed: onEdit,
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: const Text('Editar'),
                ),
                const SizedBox(width: 8),
                TextButton.icon(
                  onPressed: onRemove,
                  icon: Icon(
                    isAdmin ? Icons.delete_outline : Icons.person_off_outlined,
                    color: isAdmin ? ItbColors.red : null,
                    size: 18,
                  ),
                  label: Text(
                    isAdmin ? 'Excluir' : 'Inativar',
                    style: TextStyle(
                      color: isAdmin ? ItbColors.red : null,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    ),
  );
}
