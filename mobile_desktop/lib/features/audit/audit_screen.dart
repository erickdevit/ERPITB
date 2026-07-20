import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/database/local_repository.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
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
        Row(
          children: [
            Expanded(
              child: Text(
                'Auditoria e sincronização',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: ItbColors.navy,
                ),
              ),
            ),
            IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
          ],
        ),
        const SizedBox(height: 12),
        TextField(
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.search),
            labelText: 'Buscar evento, entidade ou usuário',
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
        if (!loading && visible.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(36),
              child: Center(child: Text('Nenhum evento registrado.')),
            ),
          ),
        ...visible.map(
          (item) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Card(
              child: ListTile(
                leading: const CircleAvatar(
                  child: Icon(Icons.history, size: 19),
                ),
                title: Text(
                  '${item['action']} • ${item['entity_name']}',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(
                  '${item['user_name'] ?? item['details'] ?? 'Sistema'}\n${item['created_at'] ?? ''}${compact && item['entity_id'] != null ? '\nID: ${item['entity_id']}' : ''}',
                ),
                isThreeLine: !compact,
                trailing: compact || item['entity_id'] == null
                    ? null
                    : Text(
                        '${item['entity_id']}'.substring(
                          0,
                          '${item['entity_id']}'.length.clamp(0, 8),
                        ),
                        style: const TextStyle(fontFamily: 'Consolas'),
                      ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
