# Parche del cruce (usuarios del reloj)

**No reemplaza la base.** Solo agrega/actualiza usuarios y sus vínculos al reloj.
No toca checadas, cartas, tickets, tareas ni ningún otro dato.

## Antes
1. Respaldo:
   ```
   docker exec -e PGPASSWORD=<pass> cartas-postgres pg_dump -U cartas -Fc cartas > respaldo-antes-cruce.dump
   ```
2. El API nuevo tiene que haber arrancado al menos una vez: su `migrate deploy` crea
   `users.mustChangePassword`. Si no, el parche aborta y lo dice.

## Aplicar (segundos)
```
docker cp cruce-patch.sql cartas-postgres:/tmp/cruce-patch.sql
docker exec -i cartas-postgres psql -U cartas -d cartas -f /tmp/cruce-patch.sql
```

Debe terminar en `COMMIT`. Todo va en una transacción: si algo choca, no aplica nada.

- Si dice `Falta users.mustChangePassword`: arranca primero el API nuevo.
- Si dice `El parche ya se aplicó`: no hace nada (protección para no reiniciar contraseñas).
- Si dice `Hay N cuentas ajenas con un username o número del cruce`: alguien cambió
  una cuenta después del respaldo; revisar antes de reintentar.

## Resultado esperado
- 171 usuarios (33 del respaldo + 138 altas), 167 vínculos al reloj.
- 167 cuentas con contraseña `123456` y la marca para cambiarla al entrar.
- Cartas, tickets, tareas y checadas intactos.

## Rollback
Restaurar `respaldo-antes-cruce.dump` (detén el API antes).
