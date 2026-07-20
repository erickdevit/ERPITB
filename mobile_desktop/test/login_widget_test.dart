import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:frequencia_itb/core/database/local_database.dart';
import 'package:frequencia_itb/core/network/api_client.dart';
import 'package:frequencia_itb/core/sync/sync_service.dart';
import 'package:frequencia_itb/features/auth/auth_controller.dart';
import 'package:frequencia_itb/features/auth/login_screen.dart';
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

void main() {
  testWidgets('desktop login is centered without the promotional panel', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final database = LocalDatabase.inMemory();
    await database.initialize();
    addTearDown(database.dispose);
    final api = ApiClient(
      const FlutterSecureStorage(),
      client: MockClient((_) async => throw UnimplementedError()),
    );
    final auth = AuthController(database, api, SyncService(database, api));

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: auth,
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(Form), findsOneWidget);
    expect(
      find.ancestor(of: find.byType(Form), matching: find.byType(Center)),
      findsOneWidget,
    );
    expect(find.text('Frequência ITB'), findsOneWidget);
    expect(find.text('Frequência que transforma.'), findsNothing);
    expect(find.textContaining('Chamadas rápidas'), findsNothing);
    expect(find.textContaining('Base local criptografada'), findsNothing);
    expect(find.textContaining('O primeiro acesso precisa'), findsNothing);
  });
}
