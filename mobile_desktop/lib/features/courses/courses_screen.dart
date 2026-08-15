import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/database/local_repository.dart';
import '../../core/models/models.dart';
import '../../core/sync/sync_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/itb_components.dart';
import '../auth/auth_controller.dart';

class CoursesScreen extends StatefulWidget {
  const CoursesScreen({super.key});

  @override
  State<CoursesScreen> createState() => _CoursesScreenState();
}

class _CoursesScreenState extends State<CoursesScreen> {
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
    final isAdmin = user.role == UserRole.admin;

    final courses = repository
        .courses()
        .where(
          (course) =>
              search.isEmpty ||
              (course['name'] as String? ?? '')
                  .toLowerCase()
                  .contains(search.toLowerCase()),
        )
        .toList();

    return ListView(
      padding: EdgeInsets.all(compact ? 16 : 24),
      children: [
        ItbPageHeader(
          title: 'Cursos',
          subtitle: 'Gestão de cursos cadastrados',
          action: isAdmin
              ? FilledButton.icon(
                  onPressed: () => _courseDialog(context),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Novo curso'),
                )
              : null,
        ),
        const SizedBox(height: 16),
        ItbFilterCard(
          searchHint: 'Buscar curso por nome',
          searchValue: search,
          onSearchChanged: (val) => setState(() => search = val),
        ),
        const SizedBox(height: 16),
        if (courses.isEmpty)
          const Card(
            child: ItbEmptyState(
              title: 'Nenhum curso encontrado',
              subtitle: 'Cadastre os cursos oferecidos pela instituição.',
              icon: Icons.menu_book_outlined,
            ),
          )
        else
          for (final course in courses)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 14,
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: ItbColors.cyanLight,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        alignment: Alignment.center,
                        child: const Icon(
                          Icons.menu_book,
                          color: ItbColors.navy,
                          size: 22,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Text(
                          course['name'] as String? ?? '',
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                            color: ItbColors.navy,
                          ),
                        ),
                      ),
                      if (user.role.canManage) ...[
                        IconButton(
                          tooltip: 'Editar curso',
                          onPressed: () => _courseDialog(context, course: course),
                          icon: const Icon(Icons.edit_outlined, size: 20),
                        ),
                        if (isAdmin)
                          IconButton(
                            tooltip: 'Excluir curso',
                            onPressed: () => _deleteCourse(repository, course),
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
              ),
            ),
      ],
    );
  }

  Future<void> _courseDialog(
    BuildContext context, {
    Map<String, Object?>? course,
  }) async {
    var courseName = course?['name'] as String? ?? '';
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(course == null ? 'Novo curso' : 'Editar curso'),
        content: SizedBox(
          width: 400,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                initialValue: courseName,
                onChanged: (value) => courseName = value,
                decoration: const InputDecoration(
                  labelText: 'Nome do curso',
                  hintText: 'Ex: Desenvolvimento de Sistemas',
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () {
              if (courseName.trim().length < 2) {
                ScaffoldMessenger.of(dialogContext).showSnackBar(
                  const SnackBar(
                    content: Text('O nome do curso deve ter pelo menos 2 caracteres.'),
                  ),
                );
                return;
              }
              Navigator.pop(dialogContext, true);
            },
            child: const Text('Salvar'),
          ),
        ],
      ),
    );

    if (saved == true && courseName.trim().length >= 2 && context.mounted) {
      final repository = context.read<LocalRepository>();
      if (course == null) {
        repository.createCourse(name: courseName.trim());
      } else {
        repository.updateCourse(
          id: course['id']! as String,
          name: courseName.trim(),
        );
      }
      context.read<SyncService>().synchronize();
      setState(() {});
    }
  }

  Future<void> _deleteCourse(
    LocalRepository repository,
    Map<String, Object?> course,
  ) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Excluir curso'),
        content: Text('Deseja realmente excluir o curso "${course['name']}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            style: FilledButton.styleFrom(backgroundColor: ItbColors.red),
            child: const Text('Excluir'),
          ),
        ],
      ),
    );

    if (confirm == true && mounted) {
      try {
        repository.deleteCourse(course['id']! as String);
        context.read<SyncService>().synchronize();
        setState(() {});
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e.toString())),
          );
        }
      }
    }
  }
}
