@AGENTS.md

# Reglas del proyecto Sobrá

- Responder siempre en castellano rioplatense. Los botones de interfaces en inglés se nombran tal cual, con su traducción al lado.
- **Textos legales al día, sin que lo pidan.** Cada vez que se agregue o cambie una función, revisar si afecta a:
  - `src/app/terminos/page.tsx` (términos y condiciones): reglas de uso, pagos, comisiones, obligaciones de usuarios y de Sobrá.
  - `src/app/privacidad/page.tsx` (privacidad y cookies): datos nuevos que se juntan, para qué, quién los ve, cookies nuevas.
  - `src/app/devoluciones/page.tsx` (devoluciones y reclamos) y `src/app/ayuda/page.tsx` (preguntas frecuentes).
  Si corresponde, actualizarlos en el mismo cambio, poner la fecha nueva en `actualizada` y avisarle al usuario qué se agregó.
  Si un cambio en los términos afecta derechos u obligaciones de los usuarios, recordar que hay que avisarles con 10 días de anticipación.
- **Antes de lanzar** (cuando el usuario hable de publicar la app, Vercel, salir a producción o tener usuarios reales), recordarle la lista "Antes de lanzar" del README, en especial lo que dejó pendiente a propósito: plazo para avisar defectos ocultos, plazo de reembolso, horario de soporte, datos del titular, número de WhatsApp y revisión de un abogado.
- Los colores se definen solo en `src/app/globals.css` (paleta "Fuego y cielo", ver `public/marca/manual-marca.png`).
- Nunca editar migraciones ya aplicadas: cada cambio de base va en un archivo nuevo de `supabase/migrations/`, y hay que avisarle al usuario que lo ejecute.
