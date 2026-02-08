# Setup VBase para PaymentsWay (solo pruebas)

Cuando VTEX no envía los settings del provider al connector, puedes guardarlos en VBase como fallback.

## Método 1: Script con vtex api

```bash
# 1. Logueado con vtex whoami
# 2. En el workspace correcto (master para producción)
vtex use master

# 3. Ejecutar el script
node scripts/setup-vbase.js 698 593 622 "tu-api-key"
```

## Método 2: Si el script falla

El comando `vtex api` puede no tener permisos para VBase. En ese caso:

1. **Contacta a soporte de VTEX** para que revisen por qué no se envían los Provider Fields en el request.

2. **Prueba con variables de entorno** (si tu cuenta lo permite):
   ```
   PAYMENTSWAY_MERCHANT_ID=698
   PAYMENTSWAY_TERMINAL_ID=593
   PAYMENTSWAY_FORM_ID=622
   PAYMENTSWAY_API_KEY=tu-api-key
   ```

3. **App Settings**: Configura los valores en Admin > Apps > PaymentsWay Gateway > Settings (si la app expone esa opción).

## Orden de fallback del connector

1. Request de VTEX (merchantSettings, paymentProvider.settings)
2. App Settings
3. Variables de entorno
4. VBase (bucket: paymentsway, path: provider-settings.json)
