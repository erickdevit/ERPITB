import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/database/local_repository.dart';
import '../../core/models/models.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/itb_components.dart';

class UsersScreen extends StatefulWidget {
  const UsersScreen({super.key});
  @override
  State<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends State<UsersScreen> {
  bool loading = true;
  String query = '';
  String? role;
  Timer? debounce;

  @override
  void initState() {
    super.initState();
    Future.microtask(_load);
  }

  @override
  void dispose() {
    debounce?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => loading = true);
    try {
      final result = await context.read<ApiClient>().get('/users');
      final items = (result['items'] as List).cast<Map<String, dynamic>>();
      if (!mounted) return;
      context.read<LocalRepository>().replaceDirectoryUsers(items);
    } catch (error) {
      if (mounted) _message(error.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 700;
    final all = context.read<LocalRepository>().directoryUsers(
      includeInactive: false,
    );
    final term = query.toLowerCase();
    final users = all
        .where(
          (u) =>
              (role == null || u['role'] == role) &&
              (term.isEmpty ||
                  '${u['name']} ${u['email']}'.toLowerCase().contains(term)),
        )
        .toList();

    return ListView(
      padding: EdgeInsets.all(compact ? 16 : 24),
      children: [
        ItbPageHeader(
          title: 'Usuários',
          subtitle: 'Acessos, funções e situação cadastral.',
          action: FilledButton.icon(
            onPressed: () => _edit(),
            icon: const Icon(Icons.person_add_alt_1, size: 18),
            label: const Text('Novo usuário'),
          ),
        ),
        const SizedBox(height: 16),
        ItbFilterCard(
          searchHint: 'Buscar por nome ou e-mail',
          searchValue: query,
          onSearchChanged: (val) => setState(() => query = val),
          filters: [
            SizedBox(
              width: compact ? double.infinity : 280,
              child: DropdownButtonFormField<String?>(
                initialValue: role,
                isExpanded: true,
                decoration: const InputDecoration(
                  isDense: true,
                  labelText: 'Perfil',
                ),
                items: const [
                  DropdownMenuItem(value: null, child: Text('Todos os perfis')),
                  DropdownMenuItem(
                    value: 'professor',
                    child: Text('Professor'),
                  ),
                  DropdownMenuItem(
                    value: 'pedagogico',
                    child: Text('Administrativo / Secretaria'),
                  ),
                  DropdownMenuItem(
                    value: 'admin',
                    child: Text('Administrador'),
                  ),
                ],
                onChanged: (value) => setState(() => role = value),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (loading)
          const LinearProgressIndicator()
        else if (compact && users.isNotEmpty)
          Column(
            key: const Key('mobile-user-list'),
            children: [
              for (final user in users)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Card(
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
                                  '${user['name']}'.substring(0, 1).toUpperCase(),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    color: ItbColors.blue,
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
                                      '${user['name']}',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 15,
                                        color: ItbColors.navy,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      '${user['email']}',
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 13,
                                        color: ItbColors.textSecondary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              ItbStatusBadge.userActive(user['active'] == 1),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Text(
                            'Perfil: ${UserRole.parse('${user['role']}').label}',
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const Divider(height: 24),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              TextButton.icon(
                                onPressed: () => _edit(user),
                                icon: const Icon(Icons.edit_outlined, size: 18),
                                label: const Text('Editar'),
                              ),
                              if (user['active'] == 1) ...[
                                const SizedBox(width: 8),
                                TextButton.icon(
                                  onPressed: () => _delete('${user['id']}'),
                                  icon: const Icon(
                                    Icons.delete_outline,
                                    color: ItbColors.red,
                                    size: 18,
                                  ),
                                  label: const Text(
                                    'Excluir',
                                    style: TextStyle(color: ItbColors.red),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          )
        else
          Card(
            child: users.isEmpty
                ? const ItbEmptyState(
                    title: 'Nenhum usuário encontrado',
                    subtitle: 'Cadastre novos usuários institucionais.',
                    icon: Icons.manage_accounts_outlined,
                  )
                : ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: DataTable(
                        columns: const [
                          DataColumn(label: Text('Nome')),
                          DataColumn(label: Text('E-mail')),
                          DataColumn(label: Text('Perfil')),
                          DataColumn(label: Text('Status')),
                          DataColumn(label: Text('Ações')),
                        ],
                        rows: users
                            .map(
                              (u) => DataRow(
                                cells: [
                                  DataCell(
                                    Text(
                                      '${u['name']}',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        color: ItbColors.navy,
                                      ),
                                    ),
                                  ),
                                  DataCell(Text('${u['email']}')),
                                  DataCell(
                                    Text(
                                      UserRole.parse('${u['role']}').label,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ),
                                  DataCell(
                                    ItbStatusBadge.userActive(
                                      u['active'] == 1,
                                    ),
                                  ),
                                  DataCell(
                                    Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        IconButton(
                                          tooltip: 'Editar',
                                          onPressed: () => _edit(u),
                                          icon: const Icon(
                                            Icons.edit_outlined,
                                            size: 19,
                                          ),
                                        ),
                                        if (u['active'] == 1)
                                          IconButton(
                                            tooltip: 'Excluir usuário',
                                            onPressed: () =>
                                                _delete('${u['id']}'),
                                            icon: const Icon(
                                              Icons.delete_outline,
                                              color: ItbColors.red,
                                              size: 19,
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            )
                            .toList(),
                      ),
                    ),
                  ),
          ),
      ],
    );
  }

  Future<Map<String, dynamic>?> _dialog([Map<String, Object?>? item]) async {
    var userName = item?['name'] as String? ?? '';
    var userEmail = item?['email'] as String? ?? '';
    var userPassword = '';
    var selectedRole = item?['role'] as String? ?? 'professor';
    var active = item?['active'] == null || item?['active'] == 1;
    return showDialog<Map<String, dynamic>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (_, setDialogState) => AlertDialog(
          title: Text(item == null ? 'Novo usuário' : 'Editar usuário'),
          content: SizedBox(
            width: 460,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(
                    initialValue: userName,
                    onChanged: (value) => userName = value,
                    decoration: const InputDecoration(
                      labelText: 'Nome completo *',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    initialValue: userEmail,
                    onChanged: (value) => userEmail = value,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(labelText: 'E-mail *'),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: selectedRole,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Perfil *'),
                    items: const [
                      DropdownMenuItem(
                        value: 'professor',
                        child: Text('Professor'),
                      ),
                      DropdownMenuItem(
                        value: 'pedagogico',
                        child: Text('Administrativo / Secretaria'),
                      ),
                      DropdownMenuItem(
                        value: 'admin',
                        child: Text('Administrador'),
                      ),
                    ],
                    onChanged: (v) => setDialogState(() => selectedRole = v!),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    onChanged: (value) => userPassword = value,
                    obscureText: true,
                    decoration: InputDecoration(
                      labelText: item == null
                          ? 'Senha (mínimo 6 caracteres) *'
                          : 'Nova senha (opcional)',
                    ),
                  ),
                  if (item != null) ...[
                    const SizedBox(height: 6),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      value: active,
                      title: const Text('Usuário ativo'),
                      onChanged: (v) => setDialogState(() => active = v),
                    ),
                  ],
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () {
                if (userName.trim().length < 2 ||
                    !userEmail.contains('@') ||
                    (item == null && userPassword.length < 6) ||
                    (userPassword.isNotEmpty && userPassword.length < 6)) {
                  _message('Preencha os campos obrigatórios corretamente.');
                  return;
                }
                Navigator.pop(dialogContext, {
                  'name': userName.trim(),
                  'email': userEmail.trim(),
                  'role': selectedRole,
                  'active': active,
                  if (userPassword.isNotEmpty) 'password': userPassword,
                });
              },
              child: const Text('Salvar'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _edit([Map<String, Object?>? item]) async {
    final data = await _dialog(item);
    if (data == null || !mounted) return;
    try {
      if (item == null) {
        await context.read<ApiClient>().post('/users', data);
      } else {
        await context.read<ApiClient>().patch('/users/${item['id']}', data);
      }
      await _load();
      if (mounted) _message('Usuário salvo.');
    } catch (e) {
      if (mounted) _message(e.toString());
    }
  }

  Future<void> _delete(String id) async {
    final ok =
        await showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
            title: const Text('Excluir usuário?'),
            content: const Text(
              'O acesso será removido das listagens ativas, mas o histórico será preservado.',
            ),
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
        ) ??
        false;
    if (!ok || !mounted) return;
    try {
      await context.read<ApiClient>().delete('/users/$id');
      await _load();
    } catch (e) {
      if (mounted) _message(e.toString());
    }
  }

  void _message(String value) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(value)));
}
