import 'dart:convert';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/database/local_repository.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/sync/sync_service.dart';
import '../auth/auth_controller.dart';

class ConflictsScreen extends StatefulWidget {
  const ConflictsScreen({super.key});
  @override
  State<ConflictsScreen> createState() => _ConflictsScreenState();
}

class _ConflictsScreenState extends State<ConflictsScreen> {
  List<Map<String, dynamic>> remote = [];
  bool loading = true;
  String? error;
  String search = '';
  Timer? debounce;

  @override
  void dispose() {
    debounce?.cancel();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final auth = context.read<AuthController>();
    if (auth.offline) {
      setState(() {
        loading = false;
        error = 'Modo offline: exibindo pendências salvas localmente.';
      });
      return;
    }
    try {
      final result = await context.read<ApiClient>().get('/conflicts');
      if (mounted) {
        setState(() {
          remote = (result['items'] as List<dynamic>)
              .cast<Map<String, dynamic>>();
          loading = false;
          error = null;
        });
      }
    } catch (exception) {
      if (mounted) {
        setState(() {
          loading = false;
          error = '$exception';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 700;
    final locals = context.read<LocalRepository>().conflicts();
    final term = search.trim().toLowerCase();
    final pending = remote
        .where((item) => item['status'] == 'PENDING')
        .where(
          (item) =>
              term.isEmpty ||
              '${item['entity_name']} ${item['entity_id']} ${item['created_at']}'
                  .toLowerCase()
                  .contains(term),
        )
        .toList();
    final visibleLocals = locals
        .where(
          (item) =>
              term.isEmpty ||
              '${item['entity_name']} ${item['entity_id']} ${item['status']}'
                  .toLowerCase()
                  .contains(term),
        )
        .toList();
    return ListView(
      padding: EdgeInsets.all(compact ? 16 : 24),
      children: [
        Text(
          'Central de conflitos',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
            color: ItbColors.navy,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Compare as duas versões antes de decidir. Toda resolução exige justificativa e fica auditada.',
        ),
        const SizedBox(height: 18),
        TextField(
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.search),
            labelText: 'Buscar conflito ou entidade',
          ),
          onChanged: (value) {
            debounce?.cancel();
            debounce = Timer(const Duration(milliseconds: 350), () {
              if (mounted) setState(() => search = value);
            });
          },
        ),
        const SizedBox(height: 12),
        if (loading) const LinearProgressIndicator(),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              error!,
              style: const TextStyle(color: ItbColors.orange),
            ),
          ),
        if (!loading && pending.isEmpty && visibleLocals.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(40),
              child: Column(
                children: [
                  Icon(
                    Icons.check_circle_outline,
                    color: ItbColors.green,
                    size: 46,
                  ),
                  SizedBox(height: 10),
                  Text('Nenhum conflito pendente.'),
                ],
              ),
            ),
          ),
        ...pending.map((item) => _ConflictCard(item: item, onResolved: _load)),
        if (visibleLocals.isNotEmpty) ...[
          const Padding(
            padding: EdgeInsets.only(top: 18, bottom: 8),
            child: Text(
              'Pendências deste dispositivo',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          ...visibleLocals.map((item) {
            final rejected = item['status'] == 'REJECTED';
            final details = item['remote_data_json'] == null
                ? null
                : jsonDecode(item['remote_data_json']! as String)
                      as Map<String, dynamic>;
            return Card(
              child: ListTile(
                leading: Icon(
                  rejected ? Icons.block_outlined : Icons.cloud_off,
                  color: ItbColors.orange,
                ),
                title: Text('${item['entity_name']} • ${item['entity_id']}'),
                subtitle: Text(
                  rejected
                      ? '${details?['message'] ?? 'Operação rejeitada pelo servidor.'}'
                      : 'Será reconciliado com a Central quando houver conexão.',
                ),
              ),
            );
          }),
        ],
      ],
    );
  }
}

class _ConflictCard extends StatelessWidget {
  const _ConflictCard({required this.item, required this.onResolved});
  final Map<String, dynamic> item;
  final Future<void> Function() onResolved;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Card(
      child: ExpansionTile(
        leading: const Icon(Icons.compare_arrows, color: ItbColors.orange),
        title: Text(
          '${item['entity_name']} • ${item['entity_id']}',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        subtitle: Text('Criado em ${item['created_at']}'),
        children: [
          Padding(
            padding: const EdgeInsets.all(18),
            child: LayoutBuilder(
              builder: (_, constraints) {
                final panels = [
                  _VersionPanel(
                    title: 'Versão deste dispositivo',
                    data: item['local_data'],
                  ),
                  _VersionPanel(
                    title: 'Versão no servidor',
                    data: item['remote_data'],
                  ),
                ];
                return Column(
                  children: [
                    if (constraints.maxWidth > 700)
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(child: panels[0]),
                          const SizedBox(width: 12),
                          Expanded(child: panels[1]),
                        ],
                      )
                    else ...[
                      panels[0],
                      const SizedBox(height: 12),
                      panels[1],
                    ],
                    const SizedBox(height: 14),
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton.icon(
                        onPressed: () => _resolve(context),
                        icon: const Icon(Icons.gavel_outlined),
                        label: const Text('Resolver'),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    ),
  );

  Future<void> _resolve(BuildContext context) async {
    var decision = 'remote';
    var justification = '';
    final api = context.read<ApiClient>();
    final messenger = ScaffoldMessenger.of(context);
    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Resolver conflito'),
          content: SizedBox(
            width: 440,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'remote', label: Text('Servidor')),
                    ButtonSegment(value: 'local', label: Text('Dispositivo')),
                  ],
                  selected: {decision},
                  onSelectionChanged: (value) =>
                      setDialogState(() => decision = value.first),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  onChanged: (value) => justification = value,
                  minLines: 3,
                  maxLines: 5,
                  decoration: const InputDecoration(
                    labelText: 'Justificativa obrigatória',
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Confirmar'),
            ),
          ],
        ),
      ),
    );
    if (accepted != true) {
      return;
    }
    if (justification.trim().length < 10) {
      if (context.mounted) {
        messenger.showSnackBar(
          const SnackBar(
            content: Text('A justificativa deve ter ao menos 10 caracteres.'),
          ),
        );
      }
      return;
    }
    try {
      await api.post('/conflicts/${item['id']}/resolve', {
        'decision': decision,
        'justification': justification.trim(),
      });
      if (context.mounted) {
        context.read<LocalRepository>().dismissConflict(
          item['id'] as String,
          item['remote_data'] as Map<String, dynamic>?,
        );
        context.read<SyncService>().synchronize();
      }
      await onResolved();
    } on ApiException catch (error) {
      if (context.mounted) {
        messenger.showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }
}

class _VersionPanel extends StatelessWidget {
  const _VersionPanel({required this.title, required this.data});
  final String title;
  final Object? data;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: const Color(0xFFF4F7FA),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        SelectableText(
          const JsonEncoder.withIndent('  ').convert(data),
          style: const TextStyle(fontFamily: 'Consolas', fontSize: 12),
        ),
      ],
    ),
  );
}
