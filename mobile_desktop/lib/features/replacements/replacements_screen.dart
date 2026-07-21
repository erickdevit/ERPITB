import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/database/local_repository.dart';
import '../../core/models/models.dart';

class ReplacementsScreen extends StatefulWidget {
  const ReplacementsScreen({super.key});

  @override
  State<ReplacementsScreen> createState() => _ReplacementsScreenState();
}

class _ReplacementsScreenState extends State<ReplacementsScreen> {
  final _searchController = TextEditingController();
  String? _selectedClassId;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final repository = context.watch<LocalRepository>();
    final session = context.watch<UserSession?>();
    
    // Fetch classes for filter dropdown
    final classList = repository.classes(
      session ?? const UserSession(id: '', name: '', email: '', role: UserRole.admin),
    );

    // Query replacement items based on search and class filter
    final items = repository.replacementRecords(
      search: _searchController.text,
      classId: _selectedClassId,
    );

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xFF003B46).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          Icons.event_repeat,
                          color: Color(0xFF003B46),
                          size: 28,
                        ),
                      ),
                      const SizedBox(width: 16),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Alunos em Reposição',
                            style: TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF003B46),
                            ),
                          ),
                          Text(
                            'Listagem de alunos com reposição de aula agendada (${items.length})',
                            style: TextStyle(
                              color: Colors.grey[600],
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  LayoutBuilder(
                    builder: (context, constraints) {
                      final isWide = constraints.maxWidth > 600;
                      return isWide
                          ? Row(
                              children: [
                                Expanded(child: _buildSearchField()),
                                const SizedBox(width: 16),
                                SizedBox(
                                  width: 250,
                                  child: _buildClassFilter(classList),
                                ),
                              ],
                            )
                          : Column(
                              children: [
                                _buildSearchField(),
                                const SizedBox(height: 12),
                                _buildClassFilter(classList),
                              ],
                            );
                    },
                  ),
                ],
              ),
            ),
          ),
          if (items.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(40),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.event_available,
                        size: 64,
                        color: Colors.grey[400],
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Nenhum aluno marcado para reposição',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                          color: Colors.grey[700],
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Alunos sinalizados com a opção "R" na chamada aparecerão nesta lista.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.grey[500]),
                      ),
                    ],
                  ),
                ),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final item = items[index];
                    final dateStr = DateFormat('dd/MM/yyyy').format(item.date);
                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      elevation: 1,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(
                          color: Colors.grey.withValues(alpha: 0.2),
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            CircleAvatar(
                              backgroundColor: Colors.purple.withValues(alpha: 0.15),
                              foregroundColor: Colors.purple[800],
                              radius: 24,
                              child: Text(
                                item.studentName.substring(0, 1).toUpperCase(),
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 18,
                                ),
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          item.studentName,
                                          style: const TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                      ),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 10,
                                          vertical: 4,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Colors.purple.withValues(alpha: 0.1),
                                          borderRadius: BorderRadius.circular(20),
                                          border: Border.all(
                                            color: Colors.purple.withValues(alpha: 0.3),
                                          ),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            const Icon(
                                              Icons.event_repeat,
                                              size: 14,
                                              color: Colors.purple,
                                            ),
                                            const SizedBox(width: 4),
                                            Text(
                                              'Reposição (R)',
                                              style: TextStyle(
                                                fontSize: 12,
                                                fontWeight: FontWeight.bold,
                                                color: Colors.purple[800],
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Matrícula: ${item.registrationNumber}  •  Turma: ${item.className}',
                                    style: TextStyle(
                                      fontSize: 13,
                                      color: Colors.grey[600],
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      Icon(
                                        Icons.calendar_today,
                                        size: 14,
                                        color: Colors.grey[600],
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        'Data da chamada: $dateStr',
                                        style: TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w500,
                                          color: Colors.grey[700],
                                        ),
                                      ),
                                    ],
                                  ),
                                  if (item.notes?.trim().isNotEmpty == true) ...[
                                    const SizedBox(height: 8),
                                    Container(
                                      padding: const EdgeInsets.all(10),
                                      width: double.infinity,
                                      decoration: BoxDecoration(
                                        color: Colors.grey.withValues(alpha: 0.08),
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Text(
                                        item.notes!,
                                        style: TextStyle(
                                          fontSize: 13,
                                          color: Colors.grey[800],
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
                    );
                  },
                  childCount: items.length,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildSearchField() => TextField(
        controller: _searchController,
        decoration: InputDecoration(
          hintText: 'Buscar por nome do aluno ou matrícula...',
          prefixIcon: const Icon(Icons.search),
          suffixIcon: _searchController.text.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.clear),
                  onPressed: () {
                    _searchController.clear();
                    setState(() {});
                  },
                )
              : null,
          filled: true,
          fillColor: Colors.grey.withValues(alpha: 0.05),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: Colors.grey.withValues(alpha: 0.3)),
          ),
        ),
        onChanged: (_) => setState(() {}),
      );

  Widget _buildClassFilter(List<ClassSummary> classList) =>
      DropdownButtonFormField<String?>(
        isExpanded: true,
        initialValue: _selectedClassId,
        decoration: InputDecoration(
          labelText: 'Filtrar por Turma',
          prefixIcon: const Icon(Icons.filter_list),
          filled: true,
          fillColor: Colors.grey.withValues(alpha: 0.05),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: Colors.grey.withValues(alpha: 0.3)),
          ),
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
      );
}
