import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/database/local_repository.dart';
import '../../core/models/models.dart';
import '../../core/network/api_client.dart';

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
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          runSpacing: 12,
          children: [
            const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Usuários',
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900),
                ),
                Text('Acessos, funções e situação cadastral.'),
              ],
            ),
            FilledButton.icon(
              onPressed: () => _edit(),
              icon: const Icon(Icons.person_add_alt_1),
              label: const Text('Novo usuário'),
            ),
          ],
        ),
        const SizedBox(height: 20),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            SizedBox(
              width: compact ? double.infinity : 360,
              child: TextField(
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  labelText: 'Buscar por nome ou e-mail',
                ),
                onChanged: (value) {
                  debounce?.cancel();
                  debounce = Timer(const Duration(milliseconds: 350), () {
                    if (mounted) setState(() => query = value);
                  });
                },
              ),
            ),
            SizedBox(
              width: compact ? double.infinity : 280,
              child: DropdownButtonFormField<String?>(
                initialValue: role,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Perfil'),
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
                              const CircleAvatar(
                                child: Icon(Icons.person_outline),
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
                                      ),
                                    ),
                                    Text(
                                      '${user['email']}',
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ],
                                ),
                              ),
                              Chip(
                                label: Text(
                                  user['active'] == 1 ? 'Ativo' : 'Inativo',
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Text(
                            'Perfil: ${UserRole.parse('${user['role']}').label}',
                          ),
                          const Divider(height: 24),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              TextButton.icon(
                                onPressed: () => _edit(user),
                                icon: const Icon(Icons.edit_outlined),
                                label: const Text('Editar'),
                              ),
                              if (user['active'] == 1) ...[
                                const SizedBox(width: 8),
                                TextButton.icon(
                                  onPressed: () => _delete('${user['id']}'),
                                  icon: const Icon(Icons.delete_outline),
                                  label: const Text('Excluir'),
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
                ? const Padding(
                    padding: EdgeInsets.all(32),
                    child: Center(child: Text('Nenhum usuário encontrado.')),
                  )
                : SingleChildScrollView(
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
                                DataCell(Text('${u['name']}')),
                                DataCell(Text('${u['email']}')),
                                DataCell(
                                  Text(UserRole.parse('${u['role']}').label),
                                ),
                                DataCell(
                                  Chip(
                                    label: Text(
                                      u['active'] == 1 ? 'Ativo' : 'Inativo',
                                    ),
                                  ),
                                ),
                                DataCell(
                                  Row(
                                    children: [
                                      IconButton(
                                        tooltip: 'Editar',
                                        onPressed: () => _edit(u),
                                        icon: const Icon(Icons.edit_outlined),
                                      ),
                                      if (u['active'] == 1)
                                        IconButton(
                                          tooltip: 'Excluir usuário',
                                          onPressed: () =>
                                              _delete('${u['id']}'),
                                          icon: const Icon(
                                            Icons.delete_outline,
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
                  if (item != null)
                    SwitchListTile(
                      value: active,
                      title: const Text('Usuário ativo'),
                      onChanged: (v) => setDialogState(() => active = v),
                    ),
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
