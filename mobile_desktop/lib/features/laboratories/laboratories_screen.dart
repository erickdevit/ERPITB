import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/database/local_repository.dart';
import '../../core/models/models.dart';
import '../../core/sync/sync_service.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_controller.dart';

class LaboratoriesScreen extends StatefulWidget {
  const LaboratoriesScreen({super.key});

  @override
  State<LaboratoriesScreen> createState() => _LaboratoriesScreenState();
}

class _LaboratoriesScreenState extends State<LaboratoriesScreen> {
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

    final laboratories = repository
        .laboratories()
        .where(
          (lab) =>
              search.isEmpty ||
              lab.name.toLowerCase().contains(search.toLowerCase()),
        )
        .toList();

    return ListView(
      padding: EdgeInsets.all(compact ? 16 : 24),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Laboratórios',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: ItbColors.navy,
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Gestão de laboratórios e salas de aula',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.grey[600],
                      ),
                ),
              ],
            ),
            if (isAdmin)
              FilledButton.icon(
                onPressed: () => _labDialog(context),
                icon: const Icon(Icons.add),
                label: const Text('Novo laboratório'),
              ),
          ],
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: compact ? double.infinity : 360,
          child: TextField(
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search),
              labelText: 'Buscar laboratório por nome',
            ),
            onChanged: (value) {
              debounce?.cancel();
              debounce = Timer(const Duration(milliseconds: 350), () {
                if (mounted) setState(() => search = value);
              });
            },
          ),
        ),
        const SizedBox(height: 20),
        if (laboratories.isEmpty)
          const _EmptyLabsState()
        else
          for (final lab in laboratories)
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
                      CircleAvatar(
                        backgroundColor: ItbColors.blue.withValues(alpha: .15),
                        child: const Icon(
                          Icons.science,
                          color: ItbColors.blue,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Text(
                          lab.name,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                      ),
                      if (user.role.canManage) ...[
                        IconButton(
                          tooltip: 'Editar laboratório',
                          onPressed: () => _labDialog(context, lab: lab),
                          icon: const Icon(Icons.edit_outlined),
                        ),
                        if (isAdmin)
                          IconButton(
                            tooltip: 'Excluir laboratório',
                            onPressed: () => _deleteLab(repository, lab),
                            icon: const Icon(Icons.delete_outline),
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

  Future<void> _labDialog(
    BuildContext context, {
    Laboratory? lab,
  }) async {
    var labName = lab?.name ?? '';
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(lab == null ? 'Novo laboratório' : 'Editar laboratório'),
        content: SizedBox(
          width: 400,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                initialValue: labName,
                onChanged: (value) => labName = value,
                decoration: const InputDecoration(
                  labelText: 'Nome do laboratório',
                  hintText: 'Ex: Lab de Informática 01',
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
              if (labName.trim().length < 2) {
                ScaffoldMessenger.of(dialogContext).showSnackBar(
                  const SnackBar(
                    content: Text('O nome do laboratório deve ter pelo menos 2 caracteres.'),
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

    if (saved == true && labName.trim().length >= 2 && context.mounted) {
      final repository = context.read<LocalRepository>();
      if (lab == null) {
        repository.createLaboratory(name: labName.trim());
      } else {
        repository.updateLaboratory(
          id: lab.id,
          name: labName.trim(),
        );
      }
      context.read<SyncService>().synchronize();
      setState(() {});
    }
  }

  Future<void> _deleteLab(
    LocalRepository repository,
    Laboratory lab,
  ) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Excluir laboratório'),
        content: Text('Deseja realmente excluir o laboratório "${lab.name}"?'),
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
        repository.deleteLaboratory(lab.id);
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

class _EmptyLabsState extends StatelessWidget {
  const _EmptyLabsState();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Center(
        child: Column(
          children: [
            Icon(
              Icons.science_outlined,
              size: 48,
              color: Colors.grey[400],
            ),
            const SizedBox(height: 12),
            Text(
              'Nenhum laboratório encontrado',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: Colors.grey[600],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
