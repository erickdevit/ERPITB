import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/database/local_repository.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/itb_components.dart';

class ReplacementsScreen extends StatefulWidget {
  const ReplacementsScreen({super.key});

  @override
  State<ReplacementsScreen> createState() => _ReplacementsScreenState();
}

class _ReplacementsScreenState extends State<ReplacementsScreen> {
  String _search = '';
  String? _selectedClassId;

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 700;
    final repository = context.watch<LocalRepository>();
    final session = context.watch<UserSession?>();

    // Fetch classes for filter dropdown
    final classList = repository.classes(
      session ??
          const UserSession(
            id: '',
            name: '',
            email: '',
            role: UserRole.admin,
          ),
    );

    // Query replacement items based on search and class filter
    final items = repository.replacementRecords(
      search: _search,
      classId: _selectedClassId,
    );

    return ListView(
      padding: EdgeInsets.all(compact ? 16 : 24),
      children: [
        ItbPageHeader(
          title: 'Alunos em Reposição',
          subtitle:
              'Listagem de alunos com reposição de aula agendada (${items.length})',
        ),
        const SizedBox(height: 16),
        ItbFilterCard(
          searchHint: 'Buscar por nome do aluno ou matrícula...',
          searchValue: _search,
          onSearchChanged: (val) => setState(() => _search = val),
          filters: [
            SizedBox(
              width: compact ? double.infinity : 280,
              child: DropdownButtonFormField<String?>(
                isExpanded: true,
                initialValue: _selectedClassId,
                decoration: const InputDecoration(
                  isDense: true,
                  labelText: 'Filtrar por Turma',
                ),
                items: [
                  const DropdownMenuItem<String?>(
                    value: null,
                    child: Text('Todas as Turmas'),
                  ),
                  ...classList.map(
                    (c) => DropdownMenuItem<String?>(
                      value: c.id,
                      child: Text(
                        c.name,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ],
                onChanged: (val) => setState(() => _selectedClassId = val),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (items.isEmpty)
          const Card(
            child: ItbEmptyState(
              title: 'Nenhum aluno marcado para reposição',
              subtitle:
                  'Alunos sinalizados com a opção "R" na chamada aparecerão nesta lista.',
              icon: Icons.event_available,
            ),
          )
        else
          for (final item in items)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Card(
                child: Padding(
                  padding: EdgeInsets.all(compact ? 16 : 20),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: ItbColors.purpleBg,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          item.studentName.substring(0, 1).toUpperCase(),
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 18,
                            color: ItbColors.purple,
                          ),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        item.studentName,
                                        style: const TextStyle(
                                          fontSize: 16,
                                          fontWeight: FontWeight.w700,
                                          color: ItbColors.navy,
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        'Matrícula: ${item.registrationNumber} • Turma: ${item.className}',
                                        style: const TextStyle(
                                          fontSize: 13,
                                          color: ItbColors.textSecondary,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 8),
                                ItbStatusBadge.replacement(),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                const Icon(
                                  Icons.calendar_today,
                                  size: 14,
                                  color: ItbColors.textSecondary,
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  'Data da chamada: ${DateFormat('dd/MM/yyyy').format(item.date)}',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: ItbColors.navy,
                                  ),
                                ),
                              ],
                            ),
                            if (item.notes?.trim().isNotEmpty == true) ...[
                              const SizedBox(height: 10),
                              Container(
                                padding: const EdgeInsets.all(12),
                                width: double.infinity,
                                decoration: BoxDecoration(
                                  color: ItbColors.surfaceMuted,
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: ItbColors.surfaceBorder,
                                  ),
                                ),
                                child: Text(
                                  item.notes!,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    color: ItbColors.textPrimary,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
      ],
    );
  }
}
