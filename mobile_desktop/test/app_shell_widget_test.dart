import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:frequencia_itb/core/database/local_database.dart';
import 'package:frequencia_itb/core/database/local_repository.dart';
import 'package:frequencia_itb/core/models/models.dart';
import 'package:frequencia_itb/core/network/api_client.dart';
import 'package:frequencia_itb/core/reports/report_service.dart';
import 'package:frequencia_itb/core/sync/sync_service.dart';
import 'package:frequencia_itb/core/theme/app_theme.dart';
import 'package:frequencia_itb/features/auth/auth_controller.dart';
import 'package:frequencia_itb/features/shell/app_shell.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const secureStorageChannel = MethodChannel(
    'plugins.it_nomads.com/flutter_secure_storage',
  );

  testWidgets(
    'desktop shell has title-free topbar and remembers collapsed menu per user',
    (tester) async {
      tester.view.physicalSize = const Size(1400, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(secureStorageChannel, (_) async => null);
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(secureStorageChannel, null),
      );

      final database = LocalDatabase.inMemory();
      await database.initialize();
      addTearDown(database.dispose);
      final repository = LocalRepository(database);
      final client = MockClient(
        (request) async => http.Response(
          '{"items":[]}',
          200,
          headers: {'content-type': 'application/json'},
        ),
      );
      final api = ApiClient(const FlutterSecureStorage(), client: client);
      final sync = SyncService(database, api);
      final auth = AuthController(database, api, sync)
        ..session = const UserSession(
          id: 'admin-test',
          name: 'Admin Teste',
          email: 'admin@itb.org.br',
          role: UserRole.admin,
        );

      Future<void> pumpShell() async {
        await tester.pumpWidget(
          MultiProvider(
            providers: [
              ChangeNotifierProvider.value(value: auth),
              ChangeNotifierProvider.value(value: sync),
              Provider.value(value: api),
              Provider.value(value: repository),
              Provider.value(value: ReportService(database)),
            ],
            child: MaterialApp(theme: buildTheme(), home: const AppShell()),
          ),
        );
        await tester.pumpAndSettle();
      }

      await pumpShell();
      final appBar = tester.widget<AppBar>(find.byType(AppBar));
      expect(appBar.title, isA<SizedBox>());
      final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));
      final rail = tester.widget<NavigationRail>(find.byType(NavigationRail));
      expect(scaffold.appBar, isNull);
      expect(rail.backgroundColor, isNull);
      expect(
        Theme.of(
          tester.element(find.byType(NavigationRail)),
        ).navigationRailTheme.backgroundColor,
        ItbColors.navy,
      );
      expect(rail.leading, isNull);
      expect(rail.trailing, isNotNull);
      expect(rail.trailingAtBottom, isTrue);
      expect(find.text('Usuários'), findsOneWidget);
      expect(find.text('Administrador'), findsNothing);
      expect(find.byTooltip('Recolher menu'), findsOneWidget);

      await tester.tap(find.byTooltip('Recolher menu'));
      await tester.pumpAndSettle();
      expect(repository.sidebarCollapsedFor('admin-test'), isTrue);
      expect(find.byTooltip('Expandir menu'), findsOneWidget);

      await tester.pumpWidget(const SizedBox.shrink());
      await pumpShell();
      expect(find.byTooltip('Expandir menu'), findsOneWidget);
    },
  );
}
