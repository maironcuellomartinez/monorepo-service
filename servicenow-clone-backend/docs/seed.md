PS C:\Users\mairon.cuello\development\workspace-santander\servicenow-clone-backend> npm run seed

> servicenow-clone-backend@0.0.1 seed
> ts-node -r tsconfig-paths/register src/scripts/seed-reference-data.ts

🚀 Iniciando seed de datos de referencia en servicenow_clone...

✅ Conectado a servicenow_clone

🏢 Insertando empresas (core_company)...
   ✓ Santander Argentina  sys_id=4b6f1e2a3c5d7e8f9a0b1c2d3e4f5a6b
   ✓ Santander España  sys_id=7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d
   ✓ Santander Corporate (Default)  sys_id=c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8

👥 Insertando grupos resolutores (sys_user_group)...
   ✓ Soporte IT General  sys_id=group001itsupportgeneral00000001
   ✓ Soporte Redes  sys_id=group002networksupport0000000001
   ✓ Soporte Hardware  sys_id=group003hardwaresupport000000001
   ✓ Soporte Software  sys_id=group004softwaresupport000000001
   ✓ Soporte Corner Buenos Aires  sys_id=group005cornerba0000000000000001
   ✓ Soporte Corner Madrid  sys_id=group006cornermad000000000000001

════════════════════════════════════════════════════════════════════════
  SEED COMPLETADO — sys_ids de referencia
════════════════════════════════════════════════════════════════════════

🏢 EMPRESAS (core_company) — usar en monolith → servicenow_profiles.snow_company_sys_id:

   Santander Argentina            sys_id = 4b6f1e2a3c5d7e8f9a0b1c2d3e4f5a6b
   Santander España               sys_id = 7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d
   Santander Corporate (Default)  sys_id = c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8

👥 GRUPOS RESOLUTORES (sys_user_group) — usar en monolith → corners.snow_assignment_group:

   Soporte IT General                  sys_id = group001itsupportgeneral00000001
   Soporte Redes                       sys_id = group002networksupport0000000001
   Soporte Hardware                    sys_id = group003hardwaresupport000000001
   Soporte Software                    sys_id = group004softwaresupport000000001
   Soporte Corner Buenos Aires         sys_id = group005cornerba0000000000000001
   Soporte Corner Madrid               sys_id = group006cornermad000000000000001

════════════════════════════════════════════════════════════════════════
  CONFIGURAR EN MONOLITH:
════════════════════════════════════════════════════════════════════════

  1. servicenow_profiles
     snow_company_sys_id → sys_id de la empresa correspondiente

  2. corners
     snow_assignment_group → sys_id del grupo resolutor del corner
     servicenow_location   → código de ubicación (ej: ARG-BA-001)

  3. .env del monolith
     SN_DEFAULT_COMPANY_SYS_ID=c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8

