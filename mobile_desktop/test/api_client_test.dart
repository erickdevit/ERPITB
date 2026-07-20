import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:frequencia_itb/core/network/api_client.dart';

void main() {
  test('repete login em falha temporária e preserva mensagem útil', () async {
    var requests = 0;
    final api = ApiClient(
      const FlutterSecureStorage(),
      client: MockClient((_) async {
        requests++;
        return http.Response('error code: 1102', 503);
      }),
      loginRetryDelays: const [Duration.zero, Duration.zero],
    );

    await expectLater(
      api.login('admin@itb.org.br', 'senha'),
      throwsA(
        isA<ApiException>()
            .having((error) => error.statusCode, 'statusCode', 503)
            .having(
              (error) => error.message,
              'message',
              contains('temporariamente sobrecarregado'),
            ),
      ),
    );
    expect(requests, 3);
  });

  test('não mascara resposta 200 inválida como erro do banco local', () async {
    final api = ApiClient(
      const FlutterSecureStorage(),
      client: MockClient((_) async => http.Response('<html>erro</html>', 200)),
      loginRetryDelays: const [],
    );

    await expectLater(
      api.login('admin@itb.org.br', 'senha'),
      throwsA(
        isA<ApiException>()
            .having((error) => error.code, 'code', 'INVALID_RESPONSE')
            .having(
              (error) => error.message,
              'message',
              contains('resposta inválida'),
            ),
      ),
    );
  });
}
