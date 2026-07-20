import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_theme.dart';
import 'auth_controller.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    await context.read<AuthController>().login(_email.text, _password.text);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const _BrandMark(),
                  const SizedBox(height: 42),
                  Text(
                    'Boas-vindas',
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: ItbColors.navy,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Entre com sua conta institucional.',
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 32),
                  TextFormField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    decoration: const InputDecoration(
                      labelText: 'E-mail',
                      prefixIcon: Icon(Icons.alternate_email),
                    ),
                    validator: (value) => value == null || !value.contains('@')
                        ? 'Informe um e-mail válido.'
                        : null,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _password,
                    obscureText: _obscure,
                    autofillHints: const [AutofillHints.password],
                    decoration: InputDecoration(
                      labelText: 'Senha',
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        onPressed: () => setState(() => _obscure = !_obscure),
                        icon: Icon(
                          _obscure
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                        ),
                      ),
                    ),
                    validator: (value) => (value?.length ?? 0) < 8
                        ? 'A senha deve ter ao menos 8 caracteres.'
                        : null,
                    onFieldSubmitted: (_) => _submit(),
                  ),
                  if (auth.error != null) ...[
                    const SizedBox(height: 16),
                    Text(
                      auth.error!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  FilledButton.icon(
                    onPressed: auth.loading ? null : _submit,
                    icon: auth.loading
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.login),
                    label: const Padding(
                      padding: EdgeInsets.symmetric(vertical: 14),
                      child: Text('Entrar'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BrandMark extends StatelessWidget {
  const _BrandMark();
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      SvgPicture.asset(
        'assets/itb-logo.svg',
        width: 58,
        height: 58,
        placeholderBuilder: (_) => const _BrandFallback(),
        errorBuilder: (_, _, _) => const _BrandFallback(),
      ),
      const SizedBox(width: 12),
      Text(
        'Frequência ITB',
        style: const TextStyle(
          color: ItbColors.navy,
          fontSize: 20,
          fontWeight: FontWeight.w800,
        ),
      ),
    ],
  );
}

class _BrandFallback extends StatelessWidget {
  const _BrandFallback();
  @override
  Widget build(BuildContext context) => Container(
    width: 58,
    height: 58,
    decoration: BoxDecoration(
      color: ItbColors.cyan,
      borderRadius: BorderRadius.circular(14),
    ),
    alignment: Alignment.center,
    child: const Text(
      'ITB',
      style: TextStyle(color: ItbColors.navy, fontWeight: FontWeight.w900),
    ),
  );
}
