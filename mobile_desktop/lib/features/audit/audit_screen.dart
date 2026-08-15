import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/database/local_repository.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/itb_components.dart';
import '../auth/auth_controller.dart';

class AuditScreen extends StatefulWidget {
  const AuditScreen({super.key});
  @override
  State<AuditScreen> createState() => _AuditScreenState();
}

class _AuditScreenState extends State<AuditScreen> {
  List<Map<String, dynamic>> items = [];
  bool loading = true;
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
    if (context.read<AuthController>().offline) {
      setState(() {
        items = context
            .read<LocalRepository>()
            .auditSummary()
            .map((item) => item.cast<String, dynamic>())
            .toList();
        loading = false;
      });
      return;
    }
    try {
      final result = await context.read<ApiClient>().get(
        '/audit-logs?limit=200',
      );
      if (mounted) {
        setState(() {
          items = (result['items'] as List<dynamic>)
              .cast<Map<String, dynamic>>();
          loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          items = context
              .read<LocalRepository>()
              .auditSummary()
              .map((item) => item.cast<String, dynamic>())
              .toList();
          loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 700;
    final term = search.trim().toLowerCase();
    final visible = items.where((item) {
      if (term.isEmpty) return true;
      return '${item['action']} ${item['entity_name']} ${item['user_name'] ?? ''} ${item['entity_id'] ?? ''}'
          .toLowerCase()
          .contains(term);
    }).toList();

    return ListView(
      padding: EdgeInsets.all(compact ? 16 : 24),
      children: [
        ItbPageHeader(
          title: 'Auditoria e sincronização',
          subtitle: 'Histórico de eventos, alterações e trilhas de auditoria',
          action: OutlinedButton.icon(
            onPressed: _load,
            icon: const Icon(Icons.refresh, size: 18),
            label: const Text('Atualizar'),
          ),
        ),
        const SizedBox(height: 16),
        ItbFilterCard(
          searchHint: 'Buscar evento, entidade ou usuário',
          searchValue: search,
          onSearchChanged: (val) => setState(() => search = val),
        ),
        const SizedBox(height: 16),
        if (loading) const LinearProgressIndicator(),
        if (!loading && visible.isEmpty)
          const Card(
            child: ItbEmptyState(
              title: 'Nenhum evento registrado',
              subtitle: 'Os eventos de sincronização e auditoria aparecerão aqui.',
              icon: Icons.history,
            ),
          ),
        ...visible.map(
          (item) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Card(
              child: ListTile(
                leading: Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: ItbColors.blueLight,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  alignment: Alignment.center,
                  child: const Icon(
                    Icons.history,
                    size: 20,
                    color: ItbColors.blue,
                  ),
                ),
                title: Text(
                  '${item['action']} • ${item['entity_name']}',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: ItbColors.navy,
                    fontSize: 14,
                  ),
                ),
                subtitle: Text(
                  '${item['user_name'] ?? item['details'] ?? 'Sistema'}\n${item['created_at'] ?? ''}${compact && item['entity_id'] != null ? '\nID: ${item['entity_id']}' : ''}',
                  style: const TextStyle(fontSize: 12),
                ),
                isThreeLine: !compact,
                trailing: compact || item['entity_id'] == null
                    ? null
                    : Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: ItbColors.surfaceMuted,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: ItbColors.surfaceBorder),
                        ),
                        child: Text(
                          '${item['entity_id']}'.substring(
                            0,
                            '${item['entity_id']}'.length.clamp(0, 8),
                          ),
                          style: const TextStyle(
                            fontFamily: 'Consolas',
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: ItbColors.textSecondary,
                          ),
                        ),
                      ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
