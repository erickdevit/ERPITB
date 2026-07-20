import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/business/business_rules.dart';
import '../../core/database/local_repository.dart';
import '../../core/models/models.dart';
import '../../core/sync/sync_service.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_controller.dart';

class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});
  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  String? classId;
  DateTime date = DateTime.now();
  List<AttendanceDraft> drafts = [];
  bool loaded = false;
  final generalNotes = TextEditingController();
  final Set<String> expandedNotes = {};
  String search = '';
  Timer? debounce;

  @override
  void dispose() {
    debounce?.cancel();
    generalNotes.dispose();
    super.dispose();
  }

  void _load(LocalRepository repository) {
    expandedNotes.clear();
    if (classId == null) {
      drafts = [];
      loaded = true;
      return;
    }
    drafts = repository.attendanceDrafts(classId!, date);
    generalNotes.text = repository.classNote(classId!, date);
    loaded = true;
  }

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 700;
    context.watch<SyncService>();
    final user = context.watch<AuthController>().session!;
    final repository = context.read<LocalRepository>();
    final classes = repository.classes(user);
    if (classId == null && classes.isNotEmpty) classId = classes.first.id;
    if (!loaded) _load(repository);
    final isToday = DateUtils.isSameDay(date, DateTime.now());
    final existingCall =
        classId != null && repository.callExists(classId!, date);
    final allowed =
        user.role != UserRole.professor ||
        (AttendanceRules.professorCanEdit(date, DateTime.now()) &&
            (isToday || existingCall));
    final visibleDrafts = drafts.asMap().entries.where((entry) {
      final term = search.trim().toLowerCase();
      if (term.isEmpty) return true;
      final student = entry.value.student;
      return '${student.name} ${student.registrationNumber}'
          .toLowerCase()
          .contains(term);
    }).toList();
    return Column(
      children: [
        Padding(
          padding: EdgeInsets.fromLTRB(
            compact ? 16 : 24,
            compact ? 16 : 24,
            compact ? 16 : 24,
            12,
          ),
          child: compact
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _attendanceTitle(context),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: allowed && drafts.isNotEmpty
                          ? () => _save(repository, user)
                          : null,
                      icon: const Icon(Icons.save_outlined),
                      label: const Text('Salvar chamada'),
                    ),
                  ],
                )
              : Row(
                  children: [
                    Expanded(child: _attendanceTitle(context)),
                    FilledButton.icon(
                      onPressed: allowed && drafts.isNotEmpty
                          ? () => _save(repository, user)
                          : null,
                      icon: const Icon(Icons.save_outlined),
                      label: const Text('Salvar chamada'),
                    ),
                  ],
                ),
        ),
        Padding(
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 16 : 24,
            vertical: 4,
          ),
          child: TextField(
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search),
              labelText: 'Buscar aluno na chamada',
            ),
            onChanged: (value) {
              debounce?.cancel();
              debounce = Timer(const Duration(milliseconds: 350), () {
                if (mounted) setState(() => search = value);
              });
            },
          ),
        ),
        Padding(
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 16 : 24,
            vertical: 8,
          ),
          child: Flex(
            direction: compact ? Axis.vertical : Axis.horizontal,
            crossAxisAlignment: compact
                ? CrossAxisAlignment.stretch
                : CrossAxisAlignment.center,
            children: [
              if (compact)
                DropdownButtonFormField<String>(
                  initialValue: classId,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Turma'),
                  items: _classItems(classes),
                  onChanged: (value) => setState(() {
                    classId = value;
                    _load(repository);
                  }),
                )
              else
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: classId,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Turma'),
                    items: _classItems(classes),
                    onChanged: (value) => setState(() {
                      classId = value;
                      _load(repository);
                    }),
                  ),
                ),
              SizedBox(width: compact ? 0 : 12, height: compact ? 10 : 0),
              OutlinedButton.icon(
                onPressed: () => _pickDate(repository),
                icon: const Icon(Icons.calendar_month_outlined),
                label: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  child: Text(DateFormat('dd/MM/yyyy').format(date)),
                ),
              ),
            ],
          ),
        ),
        if (!allowed)
          Container(
            margin: EdgeInsets.symmetric(
              horizontal: compact ? 16 : 24,
              vertical: 8,
            ),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: ItbColors.orange.withValues(alpha: .12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Row(
              children: [
                Icon(Icons.lock_clock_outlined, color: ItbColors.orange),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Uma chamada nova só abre no dia da aula; chamadas existentes ficam editáveis por sete dias.',
                  ),
                ),
              ],
            ),
          ),
        Padding(
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 16 : 24,
            vertical: 8,
          ),
          child: TextField(
            controller: generalNotes,
            enabled: allowed,
            maxLength: 2000,
            maxLines: 2,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.notes),
              labelText: 'Observação geral da turma nesta chamada',
            ),
          ),
        ),
        Expanded(
          child: drafts.isEmpty
              ? const Center(
                  child: Text('Selecione uma turma com matrículas ativas.'),
                )
              : ListView.separated(
                  padding: EdgeInsets.all(compact ? 16 : 24),
                  itemCount: visibleDrafts.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (_, index) {
                    final entry = visibleDrafts[index];
                    final draftIndex = entry.key;
                    final draft = entry.value;
                    final controls = _attendanceControls(
                      draft,
                      draftIndex,
                      allowed,
                    );
                    final noteField = TextFormField(
                      key: ValueKey(
                        '${draft.student.id}-${DateFormat('yyyy-MM-dd').format(date)}',
                      ),
                      initialValue: draft.notes,
                      enabled: allowed,
                      maxLength: 1000,
                      maxLines: 2,
                      decoration: const InputDecoration(
                        isDense: true,
                        prefixIcon: Icon(Icons.edit_note),
                        labelText: 'Anotação do aluno',
                      ),
                      onChanged: (value) => drafts[draftIndex] =
                          drafts[draftIndex].copyWith(notes: value),
                    );
                    return Card(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 18,
                          vertical: 10,
                        ),
                        child: Column(
                          children: [
                            if (compact) ...[
                              _studentIdentity(draft),
                              const SizedBox(height: 10),
                              SizedBox(
                                width: double.infinity,
                                child: FittedBox(
                                  fit: BoxFit.scaleDown,
                                  alignment: Alignment.centerRight,
                                  child: controls,
                                ),
                              ),
                            ] else
                              Row(
                                children: [
                                  Expanded(child: _studentIdentity(draft)),
                                  controls,
                                ],
                              ),
                            if (expandedNotes.contains(draft.student.id)) ...[
                              const SizedBox(height: 10),
                              if (compact)
                                Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    noteField,
                                    if (allowed)
                                      FilledButton.tonalIcon(
                                        onPressed: () => _saveStudentNote(
                                          repository,
                                          user,
                                          draftIndex,
                                        ),
                                        icon: const Icon(Icons.save_outlined),
                                        label: const Text('Salvar anotação'),
                                      ),
                                  ],
                                )
                              else
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Expanded(child: noteField),
                                    if (allowed) ...[
                                      const SizedBox(width: 10),
                                      FilledButton.tonalIcon(
                                        onPressed: () => _saveStudentNote(
                                          repository,
                                          user,
                                          draftIndex,
                                        ),
                                        icon: const Icon(Icons.save_outlined),
                                        label: const Text('Salvar anotação'),
                                      ),
                                    ],
                                  ],
                                ),
                            ],
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _attendanceTitle(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        'Lançamento de frequência',
        style: Theme.of(context).textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          color: ItbColors.navy,
        ),
      ),
      const Text('P = presente, F = falta, J = justificada e A = atraso.'),
    ],
  );

  List<DropdownMenuItem<String>> _classItems(List<ClassSummary> classes) => [
    for (final item in classes)
      DropdownMenuItem(
        value: item.id,
        child: Text(
          '${item.name} • ${item.courseName}',
          overflow: TextOverflow.ellipsis,
        ),
      ),
  ];

  Widget _studentIdentity(AttendanceDraft draft) => Row(
    children: [
      CircleAvatar(
        child: Text(draft.student.name.substring(0, 1).toUpperCase()),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              draft.student.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            Text(
              draft.student.registrationNumber,
              style: const TextStyle(color: Color(0xFF829AB1)),
            ),
          ],
        ),
      ),
    ],
  );

  Widget _attendanceControls(
    AttendanceDraft draft,
    int draftIndex,
    bool allowed,
  ) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      SegmentedButton<AttendanceStatus>(
        showSelectedIcon: false,
        segments: const [
          ButtonSegment(value: AttendanceStatus.present, label: Text('P')),
          ButtonSegment(value: AttendanceStatus.absent, label: Text('F')),
          ButtonSegment(value: AttendanceStatus.justified, label: Text('J')),
          ButtonSegment(value: AttendanceStatus.delayed, label: Text('A')),
        ],
        selected: {draft.status},
        onSelectionChanged: allowed
            ? (value) => setState(
                () => drafts[draftIndex] = draft.copyWith(status: value.first),
              )
            : null,
      ),
      const SizedBox(width: 4),
      IconButton(
        tooltip: expandedNotes.contains(draft.student.id)
            ? 'Fechar anotação'
            : 'Anotação do aluno',
        onPressed: () => setState(() {
          if (!expandedNotes.add(draft.student.id)) {
            expandedNotes.remove(draft.student.id);
          }
        }),
        icon: Icon(
          draft.notes?.trim().isNotEmpty == true
              ? Icons.note_alt
              : Icons.note_alt_outlined,
        ),
      ),
    ],
  );

  Future<void> _pickDate(LocalRepository repository) async {
    final selected = await showDatePicker(
      context: context,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now(),
      initialDate: date,
    );
    if (selected != null) {
      setState(() {
        date = selected;
        _load(repository);
      });
    }
  }

  void _save(LocalRepository repository, UserSession user) {
    repository.saveAttendance(
      classId: classId!,
      date: date,
      user: user,
      drafts: drafts,
      generalNotes: generalNotes.text,
    );
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Chamada salva no dispositivo. A sincronização seguirá em segundo plano.',
        ),
      ),
    );
    context.read<SyncService>().synchronize();
  }

  void _saveStudentNote(
    LocalRepository repository,
    UserSession user,
    int draftIndex,
  ) {
    repository.saveStudentAttendance(
      classId: classId!,
      date: date,
      user: user,
      draft: drafts[draftIndex],
    );
    setState(() {});
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Anotação salva.')));
    context.read<SyncService>().synchronize();
  }
}
