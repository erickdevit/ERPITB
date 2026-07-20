# Frequência ITB — cliente Flutter

Cliente Windows/Android offline-first. Requer Flutter estável, Android API 23+ e, para compilar no Windows, Visual Studio com C++/ATL e OpenSSL.

```powershell
flutter pub get
flutter analyze
flutter test
flutter run -d windows --dart-define=API_URL=http://127.0.0.1:8787
```

Use HTTPS no `API_URL` de produção. O HTTP local está liberado somente no manifest Android de debug.
