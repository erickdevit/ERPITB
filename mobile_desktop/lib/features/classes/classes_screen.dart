import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/database/local_repository.dart';
import '../../core/models/models.dart';
import '../../core/network/api_client.dart';
import '../../core/sync/sync_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/itb_components.dart';
import '../auth/auth_controller.dart';

class ClassesScreen extends StatefulWidget {
  const ClassesScreen({super.key});
  @override
  State<ClassesScreen> createState() => _ClassesScreenState();
}

class _ClassesScreenState extends State<ClassesScreen> {
  String search = '';
  String? teacherId;
  ClassSummary? selectedClass;
  Timer? debounce;

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadProfessors);
  }

  Future<void> _loadProfessors() async {
    try {
      final response = await context.read<ApiClient>().get('/users');
      if (!mounted) return;
      context.read<LocalRepository>().replaceDirectoryUsers(
        (response['items'] as List).cast<Map<String, dynamic>>(),
      );
      if (mounted) setState(() {});
    } catch (_) {}
  }

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
    final professors = repository.directoryUsers(
      role: 'professor',
      includeInactive: false,
    );
    final classes = repository.classes(
      user,
      search: search,
      teacherId: teacherId,
    );

    if (selectedClass != null) {
      return _classDetails(context, repository, user, selectedClass!);
    }

    return ListView(
      padding: EdgeInsets.all(compact ? 16 : 24),
      children: [
        ItbPageHeader(
          title: user.role.canManage ? 'Turmas' : 'Minhas turmas',
          subtitle: 'Gestão de turmas e horários de aula',
          action: user.role.name == 'admin'
              ? FilledButton.icon(
                  onPressed: () => _classDialog(context),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Nova turma'),
                )
              : null,
        ),
        const SizedBox(height: 16),
        ItbFilterCard(
          searchHint: 'Buscar turma ou curso',
          searchValue: search,
          onSearchChanged: (value) => setState(() => search = value),
          filters: [
            if (user.role.canManage)
              SizedBox(
                width: compact ? double.infinity : 300,
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
          ],
        ),
        const SizedBox(height: 16),
        if (classes.isEmpty)
          const _EmptyState()
        else
          ...classes.map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Card(
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: () => setState(() => selectedClass = item),
                  child: Padding(
                    padding: EdgeInsets.all(compact ? 16 : 20),
                    child: compact
                        ? _mobileClassContent(item, user, repository)
                        : _desktopClassContent(item, user, repository),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  static String _shift(String value) =>
      {
        'manha': 'Manhã',
        'tarde': 'Tarde',
        'noite': 'Noite',
        'integral': 'Integral',
      }[value] ??
      value;

  Widget _mobileClassContent(
    ClassSummary item,
    UserSession user,
    LocalRepository repository,
  ) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: item.isKids ? ItbColors.orangeBg : ItbColors.blueLight,
              borderRadius: BorderRadius.circular(12),
            ),
            alignment: Alignment.center,
            child: Icon(
              item.isKids ? Icons.child_care : Icons.groups_outlined,
              color: item.isKids ? ItbColors.orange : ItbColors.blue,
              size: 24,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        item.name,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                          color: ItbColors.navy,
                        ),
                      ),
                    ),
                    if (item.isKids) ...[
                      const SizedBox(width: 6),
                      ItbStatusBadge.kids(),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  item.courseName,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    color: ItbColors.textSecondary,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    _chip(_shift(item.shift), Icons.schedule),
                    if (item.weekDay != null)
                      _chip(item.weekDay!, Icons.calendar_today),
                    if (item.laboratoryName != null)
                      _chip(item.laboratoryName!, Icons.science),
                  ],
                ),
                if (item.teacherName != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    'Prof: ${item.teacherName!}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: ItbColors.textSecondary,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: item.attendanceRate < 75
                  ? ItbColors.redBg
                  : ItbColors.greenBg,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              '${item.attendanceRate.toStringAsFixed(1)}%',
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 14,
                color: item.attendanceRate < 75
                    ? ItbColors.red
                    : ItbColors.green,
              ),
            ),
          ),
        ],
      ),
      if (user.role.canManage) ...[
        const Divider(height: 20),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            IconButton(
              tooltip: 'Editar turma',
              onPressed: () => _classDialog(context, item: item),
              icon: const Icon(Icons.edit_outlined, size: 20),
            ),
            IconButton(
              tooltip: 'Professores',
              onPressed: () => _teachersDialog(context, item),
              icon: const Icon(Icons.co_present_outlined, size: 20),
            ),
            if (user.role == UserRole.admin)
              IconButton(
                tooltip: 'Excluir turma',
                onPressed: () => _deleteClass(repository, item),
                icon: const Icon(Icons.delete_outline, color: ItbColors.red, size: 20),
              ),
          ],
        ),
      ],
    ],
  );

  Widget _desktopClassContent(
    ClassSummary item,
    UserSession user,
    LocalRepository repository,
  ) => Row(
    children: [
      Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: item.isKids ? ItbColors.orangeBg : ItbColors.blueLight,
          borderRadius: BorderRadius.circular(12),
        ),
        alignment: Alignment.center,
        child: Icon(
          item.isKids ? Icons.child_care : Icons.groups_outlined,
          color: item.isKids ? ItbColors.orange : ItbColors.blue,
          size: 26,
        ),
      ),
      const SizedBox(width: 16),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  item.name,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    color: ItbColors.navy,
                  ),
                ),
                if (item.isKids) ...[
                  const SizedBox(width: 8),
                  ItbStatusBadge.kids(),
                ],
              ],
            ),
            const SizedBox(height: 4),
            Text(
              item.courseName,
              style: const TextStyle(
                fontWeight: FontWeight.w500,
                color: ItbColors.textSecondary,
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                _chip(_shift(item.shift), Icons.schedule),
                if (item.weekDay != null)
                  _chip(item.weekDay!, Icons.calendar_today),
                if (item.laboratoryName != null)
                  _chip(item.laboratoryName!, Icons.science),
                if (item.teacherName != null)
                  _chip('Prof: ${item.teacherName!}', Icons.person_outline),
              ],
            ),
          ],
        ),
      ),
      Container(
        width: 96,
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 8),
        decoration: BoxDecoration(
          color: item.attendanceRate < 75
              ? ItbColors.redBg
              : ItbColors.greenBg,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Text(
              '${item.attendanceRate.toStringAsFixed(1)}%',
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 16,
                color: item.attendanceRate < 75
                    ? ItbColors.red
                    : ItbColors.green,
              ),
            ),
            Text(
              'presença',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: item.attendanceRate < 75
                    ? ItbColors.red
                    : ItbColors.green,
              ),
            ),
          ],
        ),
      ),
      if (user.role.canManage) ...[
        const SizedBox(width: 12),
        IconButton(
          tooltip: 'Editar turma',
          onPressed: () => _classDialog(context, item: item),
          icon: const Icon(Icons.edit_outlined, size: 20),
        ),
        IconButton(
          tooltip: 'Professores',
          onPressed: () => _teachersDialog(context, item),
          icon: const Icon(Icons.co_present_outlined, size: 20),
        ),
        if (user.role == UserRole.admin)
          IconButton(
            tooltip: 'Excluir turma',
            onPressed: () => _deleteClass(repository, item),
            icon: const Icon(Icons.delete_outline, color: ItbColors.red, size: 20),
          ),
      ],
    ],
  );

  Widget _chip(String label, IconData icon) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: ItbColors.surfaceMuted,
      borderRadius: BorderRadius.circular(8),
      border: Border.all(color: ItbColors.surfaceBorder),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: ItbColors.textSecondary),
        const SizedBox(width: 4),
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w500,
            color: ItbColors.textPrimary,
          ),
        ),
      ],
    ),
  );

  Future<void> _classDialog(BuildContext context, {ClassSummary? item}) async {
    final repository = context.read<LocalRepository>();
    final courses = repository.courses();
    final labs = repository.laboratories();

    if (courses.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Cadastre um curso antes da turma.')),
      );
      return;
    }

    String courseId = item?.courseId ?? courses.first['id']! as String;
    String shift = item?.shift ?? 'manha';
    String? weekDay = item?.weekDay;
    bool isKids = item?.isKids ?? false;
    String? selectedLaboratory = item?.laboratoryId;

    var professors = repository.directoryUsers(
      role: 'professor',
      includeInactive: false,
    );
    if (item == null && professors.isEmpty) {
      await _loadProfessors();
      if (!context.mounted) return;
      professors = repository.directoryUsers(
        role: 'professor',
        includeInactive: false,
      );
    }
    String? selectedTeacher =
        item?.teacherId ??
        (professors.isEmpty ? null : professors.first['id'] as String);
    var className = item?.name ?? '';

    final weekDays = [
      'Segunda-feira',
      'Terça-feira',
      'Quarta-feira',
      'Quinta-feira',
      'Sexta-feira',
      'Sábado',
      'Domingo',
    ];

    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, refresh) => AlertDialog(
          title: Text(item == null ? 'Nova turma' : 'Editar turma'),
          content: SizedBox(
            width: 480,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (item == null)
                    DropdownButtonFormField<String>(
                      isExpanded: true,
                      initialValue: courseId,
                      decoration: const InputDecoration(labelText: 'Curso'),
                      items: [
                        for (final course in courses)
                          DropdownMenuItem(
                            value: course['id']! as String,
                            child: Text(course['name']! as String),
                          ),
                      ],
                      onChanged: (value) => refresh(() => courseId = value!),
                    ),
                  if (item == null) const SizedBox(height: 12),
                  TextFormField(
                    initialValue: className,
                    onChanged: (value) => className = value,
                    decoration: const InputDecoration(
                      labelText: 'Nome da turma',
                      hintText: 'Ex: 1º Ano A',
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          isExpanded: true,
                          initialValue: shift,
                          decoration: const InputDecoration(labelText: 'Turno'),
                          items: const [
                            DropdownMenuItem(
                              value: 'manha',
                              child: Text('Manhã'),
                            ),
                            DropdownMenuItem(
                              value: 'tarde',
                              child: Text('Tarde'),
                            ),
                            DropdownMenuItem(
                              value: 'noite',
                              child: Text('Noite'),
                            ),
                            DropdownMenuItem(
                              value: 'integral',
                              child: Text('Integral'),
                            ),
                          ],
                          onChanged: (value) => refresh(() => shift = value!),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: DropdownButtonFormField<String?>(
                          isExpanded: true,
                          initialValue: weekDay,
                          decoration: const InputDecoration(
                            labelText: 'Dia da semana',
                          ),
                          items: [
                            const DropdownMenuItem(
                              value: null,
                              child: Text('Não especificado'),
                            ),
                            for (final day in weekDays)
                              DropdownMenuItem(value: day, child: Text(day)),
                          ],
                          onChanged: (value) => refresh(() => weekDay = value),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String?>(
                    isExpanded: true,
                    initialValue: selectedLaboratory,
                    decoration: const InputDecoration(labelText: 'Laboratório'),
                    items: [
                      const DropdownMenuItem(
                        value: null,
                        child: Text('Nenhum laboratório'),
                      ),
                      for (final lab in labs)
                        DropdownMenuItem(value: lab.id, child: Text(lab.name)),
                    ],
                    onChanged: (value) =>
                        refresh(() => selectedLaboratory = value),
                  ),
                  const SizedBox(height: 6),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text(
                      'Turma Kids',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                    subtitle: const Text(
                      'Identifica se a turma é da categoria Kids',
                    ),
                    value: isKids,
                    onChanged: (value) => refresh(() => isKids = value),
                  ),
                  if (item == null) ...[
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: selectedTeacher,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Professor responsável *',
                      ),
                      items: professors
                          .map(
                            (p) => DropdownMenuItem(
                              value: p['id'] as String,
                              child: Text('${p['name']}'),
                            ),
                          )
                          .toList(),
                      onChanged: (value) =>
                          refresh(() => selectedTeacher = value),
                    ),
                    const SizedBox(height: 8),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: () async {
                          final created = await _quickProfessor(context);
                          if (created != null) {
                            professors = repository.directoryUsers(
                              role: 'professor',
                              includeInactive: false,
                            );
                            refresh(() => selectedTeacher = created);
                          }
                        },
                        icon: const Icon(Icons.person_add_alt_1, size: 18),
                        label: const Text('Criar professor agora'),
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
              onPressed: () {
                if (className.trim().length < 2 ||
                    (item == null && selectedTeacher == null)) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text(
                        'Informe o nome e o professor responsável.',
                      ),
                    ),
                  );
                  return;
                }
                Navigator.pop(context, true);
              },
              child: const Text('Salvar'),
            ),
          ],
        ),
      ),
    );

    if (saved == true && className.trim().length >= 2 && context.mounted) {
      if (item == null) {
        repository.createClass(
          courseId: courseId,
          name: className,
          shift: shift,
          weekDay: weekDay,
          isKids: isKids,
          laboratoryId: selectedLaboratory,
          teacherId: selectedTeacher!,
        );
      } else {
        repository.updateClass(
          id: item.id,
          name: className,
          shift: shift,
          weekDay: weekDay,
          isKids: isKids,
          laboratoryId: selectedLaboratory,
        );
      }
      context.read<SyncService>().synchronize();
      setState(() {});
    }
  }

  Future<String?> _quickProfessor(BuildContext context) async {
    var professorName = '';
    var professorEmail = '';
    var professorPassword = '';
    final save = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Novo professor'),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                onChanged: (value) => professorName = value,
                decoration: const InputDecoration(labelText: 'Nome *'),
              ),
              const SizedBox(height: 12),
              TextFormField(
                onChanged: (value) => professorEmail = value,
                decoration: const InputDecoration(labelText: 'E-mail *'),
              ),
              const SizedBox(height: 12),
              TextFormField(
                onChanged: (value) => professorPassword = value,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Senha (mínimo 6 caracteres) *',
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Criar'),
          ),
        ],
      ),
    );
    if (save != true ||
        professorName.trim().length < 2 ||
        !professorEmail.contains('@') ||
        professorPassword.length < 6 ||
        !context.mounted) {
      return null;
    }
    try {
      final created = await context.read<ApiClient>().post('/users', {
        'name': professorName.trim(),
        'email': professorEmail.trim(),
        'password': professorPassword,
        'role': 'professor',
      });
      await _loadProfessors();
      return created['id'] as String;
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.toString())));
      }
      return null;
    }
  }

  Future<void> _teachersDialog(BuildContext context, ClassSummary item) async {
    final api = context.read<ApiClient>();
    try {
      final responses = await Future.wait([
        api.get('/users?role=professor&active=true'),
        api.get('/classes/${item.id}/teachers'),
      ]);
      final professors = (responses[0]['items'] as List<dynamic>)
          .cast<Map<String, dynamic>>();
      final assigned = (responses[1]['items'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .map((row) => row['id'] as String)
          .toSet();
      var professorSearch = '';
      Timer? professorDebounce;
      if (!context.mounted) return;
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => StatefulBuilder(
          builder: (context, refresh) => AlertDialog(
            title: Text('Professores • ${item.name}'),
            content: SizedBox(
              width: 480,
              child: professors.isEmpty
                  ? const Text('Nenhum usuário professor ativo foi encontrado.')
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        TextField(
                          decoration: const InputDecoration(
                            isDense: true,
                            prefixIcon: Icon(Icons.search, size: 20),
                            labelText: 'Buscar professor por nome ou e-mail',
                          ),
                          onChanged: (value) {
                            professorDebounce?.cancel();
                            professorDebounce = Timer(
                              const Duration(milliseconds: 350),
                              () => refresh(() => professorSearch = value),
                            );
                          },
                        ),
                        const SizedBox(height: 10),
                        Flexible(
                          child: ListView(
                            shrinkWrap: true,
                            children: [
                              for (final professor in professors.where(
                                (row) =>
                                    professorSearch.isEmpty ||
                                    '${row['name']} ${row['email']}'
                                        .toLowerCase()
                                        .contains(
                                          professorSearch.toLowerCase(),
                                        ),
                              ))
                                CheckboxListTile(
                                  value: assigned.contains(professor['id']),
                                  title: Text(professor['name'] as String),
                                  subtitle: Text(professor['email'] as String),
                                  onChanged: (checked) async {
                                    final id = professor['id'] as String;
                                    try {
                                      if (checked == true) {
                                        await api.post(
                                          '/classes/${item.id}/teachers',
                                          {'userId': id},
                                        );
                                      } else {
                                        await api.delete(
                                          '/classes/${item.id}/teachers/$id',
                                        );
                                      }
                                      refresh(() {
                                        if (checked == true) {
                                          assigned.add(id);
                                        } else {
                                          assigned.remove(id);
                                        }
                                      });
                                    } on ApiException catch (error) {
                                      if (dialogContext.mounted) {
                                        ScaffoldMessenger.of(
                                          dialogContext,
                                        ).showSnackBar(
                                          SnackBar(
                                            content: Text(error.message),
                                          ),
                                        );
                                      }
                                    }
                                  },
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
            ),
            actions: [
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Concluir'),
              ),
            ],
          ),
        ),
      );
      professorDebounce?.cancel();
      if (context.mounted) {
        context.read<SyncService>().synchronize();
      }
    } on NetworkUnavailable {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'A atribuição de professores exige conexão para validar as contas.',
            ),
          ),
        );
      }
    } on ApiException catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  Widget _classDetails(
    BuildContext context,
    LocalRepository repository,
    UserSession user,
    ClassSummary item,
  ) {
    final compact = MediaQuery.sizeOf(context).width < 700;
    final students = repository.students(item.id);
    return ListView(
      padding: EdgeInsets.all(compact ? 16 : 24),
      children: [
        ItbPageHeader(
          leading: IconButton(
            tooltip: 'Voltar para turmas',
            onPressed: () => setState(() => selectedClass = null),
            icon: const Icon(Icons.arrow_back),
          ),
          title: item.name,
          subtitle:
              '${item.courseName} • ${_shift(item.shift)}${item.teacherName == null ? '' : ' • ${item.teacherName}'}',
          action: Chip(
            avatar: const Icon(Icons.groups_outlined, size: 18),
            label: Text('${students.length} aluno(s)'),
          ),
        ),
        const SizedBox(height: 20),
        if (students.isEmpty)
          const ItbEmptyState(
            title: 'Nenhum aluno nesta turma',
            subtitle: 'Adicione alunos a esta turma na seção de Alunos.',
            icon: Icons.groups_outlined,
          )
        else
          Card(
            child: Column(
              children: [
                for (var index = 0; index < students.length; index++) ...[
                  ListTile(
                    leading: Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: ItbColors.blueLight,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        students[index].name.substring(0, 1).toUpperCase(),
                        style: const TextStyle(
                          color: ItbColors.blue,
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                        ),
                      ),
                    ),
                    title: Text(
                      students[index].name,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        color: ItbColors.navy,
                      ),
                    ),
                    subtitle: Text(
                      'Matrícula ${students[index].registrationNumber}${students[index].contact == null ? '' : ' • ${students[index].contact}'}',
                    ),
                    trailing: compact
                        ? null
                        : Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              ItbStatusBadge.enrollment(
                                students[index].enrollmentStatus,
                              ),
                              if (user.role == UserRole.admin) ...[
                                const SizedBox(width: 6),
                                IconButton(
                                  tooltip: 'Excluir aluno',
                                  onPressed: () => _deleteStudentFromClass(
                                    repository,
                                    students[index],
                                  ),
                                  icon: const Icon(
                                    Icons.delete_outline,
                                    color: ItbColors.red,
                                    size: 20,
                                  ),
                                ),
                              ],
                            ],
                          ),
                  ),
                  if (compact)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(66, 0, 12, 10),
                      child: Row(
                        children: [
                          ItbStatusBadge.enrollment(
                            students[index].enrollmentStatus,
                          ),
                          const Spacer(),
                          if (user.role == UserRole.admin)
                            IconButton(
                              tooltip: 'Excluir aluno',
                              onPressed: () => _deleteStudentFromClass(
                                repository,
                                students[index],
                              ),
                              icon: const Icon(
                                Icons.delete_outline,
                                color: ItbColors.red,
                                size: 20,
                              ),
                            ),
                        ],
                      ),
                    ),
                  if (index < students.length - 1) const Divider(height: 1),
                ],
              ],
            ),
          ),
      ],
    );
  }

  Future<bool> _confirmDelete({
    required String title,
    required String message,
  }) async =>
      await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(title),
          content: Text(message),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              style: FilledButton.styleFrom(backgroundColor: ItbColors.red),
              child: const Text('Excluir'),
            ),
          ],
        ),
      ) ??
      false;

  Future<void> _deleteClass(
    LocalRepository repository,
    ClassSummary item,
  ) async {
    if (!await _confirmDelete(
      title: 'Excluir turma?',
      message:
          '${item.name} será removida. A exclusão só é permitida quando não há alunos ativos vinculados.',
    )) {
      return;
    }
    try {
      repository.deleteClass(item.id);
      if (!mounted) return;
      setState(() {
        if (selectedClass?.id == item.id) selectedClass = null;
      });
      context.read<SyncService>().synchronize();
    } catch (error) {
      if (mounted) _message(_errorMessage(error));
    }
  }

  Future<void> _deleteStudentFromClass(
    LocalRepository repository,
    Student student,
  ) async {
    if (!await _confirmDelete(
      title: 'Excluir aluno?',
      message:
          '${student.name} será removido da turma. O histórico já registrado será preservado.',
    )) {
      return;
    }
    repository.deleteStudent(student.id);
    if (!mounted) return;
    setState(() {});
    context.read<SyncService>().synchronize();
  }

  String _errorMessage(Object error) =>
      error is StateError ? error.message.toString() : error.toString();

  void _message(String value) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(value)));
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();
  @override
  Widget build(BuildContext context) => const ItbEmptyState(
    title: 'Nenhuma turma disponível neste dispositivo',
    subtitle: 'Conecte-se e sincronize para baixar seus dados.',
    icon: Icons.groups_outlined,
  );
}
