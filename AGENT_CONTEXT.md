# Elevizion Dashboard - Agent Context

## Wat is dit?
Kopieer deze tekst om een AI agent snel context te geven over de huidige staat van de applicatie.

---

## Project Overzicht

**Naam:** Elevizion Dashboard  
**Type:** OPS-first intern operations control room voor digital signage netwerk beheer  
**Taal:** Nederlands (alle UI teksten)  
**Stack:** React + TypeScript + Vite (frontend), Express + Drizzle ORM + PostgreSQL (backend)

## Core Principe
SCREEN_ID (EVZ-001 format) is de VERPLICHTE centrale identifier overal in het systeem.

## Navigatie (6 items)
1. **Home** (`/dashboard`) - Control Room met real-time stats, alerts, dagelijkse checklist
2. **Onboarding** (`/onboarding`) - Wizards voor nieuwe schermen, adverteerders, ads
3. **Schermen** (`/schermen`) - Schermbeheer met SCREEN_ID als centrale identifier
4. **Adverteerders** (`/adverteerders`) - Adverteerderbeheer met contract status
5. **Plaatsingen** (`/plaatsingen`) - Ad management en scherm-naar-ad mappings
6. **Instellingen** (`/instellingen`) - 5 tabs: Automations, Templates, Users, Integrations, Finance

## Database Entiteiten (Kernmodel)
- **advertisers** - Bedrijven die advertenties kopen
- **locations** - Partnerlocaties die schermen hosten
- **screens** - Fysieke displays, gelinkt aan locations
- **contracts** - Overeenkomsten tussen adverteerders en packages
- **placements** - Maps contracts naar specifieke schermen
- **templates** - WhatsApp/Email/Contract templates met versioning
- **leads** - Sales pipeline leads (adverteerder of locatie type)
- **tasks** - Taakbeheer (installatie, inkoop, onderhoud, administratief)
- **locationSurveys** - Schouw formulieren voor nieuwe locaties

## Belangrijke Features
1. **Dashboard Control Room** - FIX NOW lijst, Quick Actions, Network Health
2. **Template Center** - Categorieën (whatsapp, email, contract, invoice, internal), versioning, placeholders
3. **Contract Status** - Op adverteerder detail pagina met Reclamecontract en SEPA Machtiging status
4. **Sales Pipeline** - Kanban board met lead stages
5. **Schouw Systeem** - Mobile-optimized formulier met foto upload en supplies lijst
6. **Automatische Taak Generatie** - Bij schouw finalisatie worden installatie en inkoop taken aangemaakt
7. **Role-Based Access** - admin, finance, ops, viewer, partner rollen

## Authenticatie
Replit OIDC authenticatie met PostgreSQL-backed sessions. Gebruikers worden opgeslagen in `users` tabel met rol en optionele locatie koppeling.

## Externe Integraties
- **Yodeck API** - Digital signage player sync (YODECK_API_TOKEN)
- **Moneybird** - Nederlandse boekhoud/factuur software
- **SendGrid** - Email verzending (SENDGRID_API_KEY, optioneel)
- **Object Storage** - Foto uploads voor schouwen

## Bestandsstructuur
```
client/src/
├── pages/           # Alle pagina's (Home, Settings, Screens, etc.)
├── components/      # Herbruikbare componenten
│   ├── layout/      # Sidebar, header
│   └── ui/          # shadcn/ui componenten
├── hooks/           # Custom React hooks
└── lib/             # Utils, API client

server/
├── routes.ts        # Alle API endpoints
├── storage.ts       # Database operaties (IStorage interface)
└── replit_integrations/  # Auth, object storage

shared/
└── schema.ts        # Drizzle schema + Zod types
```

## Huidige Status
- Dashboard (Control Room) volledig operationeel met verbeterde UI:
  - Status cards in 2x3 grid met icons en kleuraccenten
  - FIX NOW sectie inklapbaar met Framer Motion animaties
  - Quick Actions via dropdown menu ("Snelle Acties" knop)
  - Compacte sidebar met bg-muted/40 voor actieve tab
- Template systeem met visuele preview (placeholder syntax verborgen)
- Contract status tracking op adverteerder detail
- Sales & Acquisitie module compleet
- Backup & Export functionaliteit beschikbaar
- Handleiding in het Nederlands beschikbaar (bijgewerkt met nieuwe navigatie en features)

## Belangrijke Notes voor Development
- `placement.screenId` verwijst naar `screens.id` (UUID), NIET naar `screens.screenId` (EVZ-001)
- Templates gebruiken `{{placeholder}}` syntax intern, getoond als `[Friendly Name]` in UI
- Snapshots bevriezen contractdata voor accurate facturering
- Alle UI tekst moet in het Nederlands zijn
