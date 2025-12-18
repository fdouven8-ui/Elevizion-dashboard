# Elevizion OS - Admin Handleiding

Deze handleiding is specifiek voor jou als hoofdbeheerder van Elevizion OS. Hier vind je alles wat je moet weten om het systeem te beheren, aan te passen en uit te breiden.

---

## Inhoudsopgave

1. [Na het Publiceren](#na-het-publiceren)
2. [Domein Koppelen](#domein-koppelen)
3. [Eerste Setup](#eerste-setup)
4. [Dagelijks Beheer](#dagelijks-beheer)
5. [Maandelijkse Taken](#maandelijkse-taken)
6. [Integraties Instellen](#integraties-instellen)
7. [Aanpassingen Maken](#aanpassingen-maken)
8. [Backup & Herstel](#backup--herstel)
9. [Problemen Oplossen](#problemen-oplossen)
10. [Belangrijke Bestanden](#belangrijke-bestanden)
11. [Mobiel Gebruik](#mobiel-gebruik)

---

## Na het Publiceren

### Stap 1: Publiceren via Replit
1. Klik op "Publish" in de rechterbovenhoek van Replit
2. Kies "Production" deployment
3. Wacht tot de build klaar is (duurt 1-3 minuten)
4. Je krijgt een `.replit.app` URL (bijv. `elevizion-os.replit.app`)

### Stap 2: Testen
1. Open de URL in een incognito venster
2. Controleer of de landingspagina laadt
3. Log in via de "Inloggen" knop
4. Controleer of het dashboard werkt

### Stap 3: Eerste Admin Account
1. Log in met je Replit account
2. Ga naar `/users` in het dashboard
3. Je account is automatisch aangemaakt als "viewer"
4. Wijzig je eigen rol naar "admin" via de database:
   - Ga naar het "Database" tabblad in Replit
   - Open de `users` tabel
   - Zoek je eigen gebruiker
   - Wijzig `role` naar `admin`

---

## Domein Koppelen

### elevizion.nl koppelen aan Replit

1. **In Replit:**
   - Ga naar je deployment settings
   - Klik op "Custom Domain"
   - Voer `elevizion.nl` in

2. **Bij je domeinregistrar (TransIP, Hostnet, etc.):**
   - Ga naar DNS instellingen voor elevizion.nl
   - Voeg een CNAME record toe:
     - Naam: `@` of leeg (voor root domain)
     - Type: `CNAME`
     - Waarde: je replit app URL (bijv. `elevizion-os.replit.app`)
   - OF voor root domains een A record:
     - Naam: `@`
     - Type: `A`
     - Waarde: het IP-adres dat Replit geeft

3. **Wachten:**
   - DNS wijzigingen kunnen 1-48 uur duren
   - Replit genereert automatisch een SSL certificaat

4. **Subdomeinen (optioneel):**
   - `www.elevizion.nl` → CNAME naar `elevizion.nl`
   - `dashboard.elevizion.nl` → voor alleen het dashboard

---

## Eerste Setup

### Checklist voor lancering

- [ ] **Bedrijfsgegevens aanpassen**
  - Bewerk `client/src/pages/Landing.tsx`
  - Pas aan: telefoonnummer, emails, KvK-nummer
  - Pas aan: pakketten en prijzen

- [ ] **Logo uploaden**
  - Plaats je logo in `client/public/elevizion-logo.png`
  - Optioneel: `client/public/favicon.png` voor browsertab

- [ ] **Email instellen** (voor contracten versturen)
  - Maak een SendGrid account aan: https://sendgrid.com
  - Genereer een API key
  - Voeg toe als Secret in Replit: `SENDGRID_API_KEY`
  - Optioneel: `SENDGRID_FROM_EMAIL` (standaard: noreply@elevizion.nl)

- [ ] **Eerste locatie toevoegen**
  - Ga naar `/locations`
  - Voeg je eerste locatie toe met alle gegevens
  - Stel omzetdeling in (standaard 10%)

- [ ] **Eerste scherm toevoegen**
  - Ga naar `/screens`
  - Koppel scherm aan de locatie
  - Optioneel: koppel Yodeck player ID

- [ ] **Eerste pakket aanmaken**
  - Nog geen UI? Doe via database:
  - Voeg record toe aan `package_plans` tabel

---

## Dagelijks Beheer

### Als Admin doe je:

1. **Dashboard checken** (`/dashboard`)
   - Bekijk de "Aandachtspunten" bovenaan (inklapbaar)
   - Alle kaarten zijn klikbaar → directe acties
   - Rood = urgent, oranje = aandacht nodig

2. **Monitoring checken** (`/monitoring`)
   - Controleer of alle schermen online zijn
   - Bekijk alerts voor offline schermen

3. **Nieuwe contracten verwerken**
   - Bekijk inkomende contract-ondertekeningen
   - Activeer goedgekeurde contracten

4. **Facturen beheren** (`/billing`)
   - Controleer openstaande facturen
   - Bij incasso: wordt automatisch afgeschreven
   - Bij overboeking: markeer als "Betaald" wanneer geld binnen is

5. **Uitbetalingen verwerken** (`/payouts`)
   - Bekijk te betalen bedragen aan locaties
   - Maak overboekingen naar locatie-IBANs
   - Markeer als "Betaald"

---

## Maandelijkse Taken

### Elke 1e van de maand:

1. **Maandafsluiting** (`/month-close`)
   - Klik op "Nieuwe Snapshot Maken"
   - Selecteer de afgelopen maand
   - Het systeem bevriest alle data van die maand

2. **Facturen genereren**
   - Na snapshot: klik "Facturen Genereren"
   - Controleer alle gegenereerde facturen
   - Verstuur naar klanten

3. **Uitbetalingen berekenen**
   - Klik "Uitbetalingen Berekenen"
   - Bekijk berekende bedragen per locatie
   - Voer betalingen uit

4. **Backup maken**
   - Ga naar `/backup`
   - Download "Volledige Backup"
   - Sla op in je cloud storage (Google Drive, Dropbox)

---

## Integraties Instellen

### Yodeck (Schermbeheer)
1. Ga naar `/integrations`
2. Voer je Yodeck API token in
3. Klik "Verbinding Testen"
4. Bij succes: schermen worden automatisch gesynchroniseerd

**Yodeck API token krijgen:**
- Log in op yodeck.com
- Ga naar Settings → API
- Genereer een API token
- Voeg toe als Secret: `YODECK_API_TOKEN`

### Moneybird (Boekhouding)
1. Ga naar `/integrations`
2. Voer je Moneybird API token in
3. Klik "Verbinding Testen"

**Moneybird API token krijgen:**
- Log in op moneybird.com
- Ga naar Instellingen → Developers → API tokens
- Maak een nieuw token aan
- Voeg toe als Secret: `MONEYBIRD_API_TOKEN`
- Voeg toe als Secret: `MONEYBIRD_ADMINISTRATION_ID` (staat in je Moneybird URL)

### Automatisch Incasso (SEPA) via Moneybird

**Voorwaarde:** Moneybird moet SEPA incasso ondersteunen (zakelijk account vereist)

**Adverteerder instellen voor incasso:**
1. Ga naar Adverteerders (`/advertisers`)
2. Klik op ⋮ menu → "Incasso instellen"
3. Vul in:
   - IBAN rekeningnummer
   - Tenaamstelling rekening
   - Vink "SEPA Machtiging Getekend" aan
4. Klik "Incasso Activeren"

**Hoe het werkt:**
- Bij facturatie: systeem stuurt SEPA info mee naar Moneybird
- Moneybird markeert contact als SEPA-actief
- Facturen krijgen betaalconditie "Automatische incasso"
- Je verzamelt betalingen via Moneybird's SEPA batch

**Machtiging verkrijgen:**
- Stuur klant een SEPA machtigingsformulier
- Na ondertekening: vink "Machtiging Getekend" aan
- Bewaar getekende machtiging in je administratie

### SendGrid (Email)
- Zie "Eerste Setup" sectie hierboven

---

## Aanpassingen Maken

### Prijzen aanpassen op landingspagina
Bewerk: `client/src/pages/Landing.tsx`
Zoek naar de "Populaire pakketten" sectie en pas de prijzen aan.

### Contact informatie wijzigen
Bewerk: `client/src/pages/Landing.tsx`
Zoek naar:
- `adverteren@elevizion.nl`
- `locaties@elevizion.nl`
- `06-12345678`
- `KvK: 12345678`

### Nieuwe pagina toevoegen
1. Maak bestand: `client/src/pages/NieuwePagina.tsx`
2. Voeg route toe in: `client/src/App.tsx`
3. Voeg menu-item toe in: `client/src/components/layout/AppSidebar.tsx`

### Kleuren aanpassen
Bewerk: `client/src/index.css`
De belangrijkste kleuren staan in de `:root` CSS variabelen.

### Database schema wijzigen
1. Bewerk: `shared/schema.ts`
2. Run: `npm run db:push` in de Shell
3. Update storage functies in: `server/storage.ts`
4. Update API routes in: `server/routes.ts`

---

## Backup & Herstel

### Backup maken
1. Ga naar `/backup` in het dashboard
2. Klik "Download Volledige Backup"
3. Bewaar het JSON bestand veilig

### Automatische backup routine
- Download elke week een volledige backup
- Bewaar minimaal 4 weken aan backups
- Sla op in: Google Drive, Dropbox, of externe schijf

### Herstel bij problemen
Bij crash of dataverlies:
1. Replit heeft automatische checkpoints
2. Klik "History" in Replit om terug te gaan
3. Of: neem contact op met Replit support

### Database direct bekijken
1. Klik op "Database" tab in Replit
2. Je ziet alle tabellen
3. Klik op een tabel om data te bekijken/bewerken

---

## Problemen Oplossen

### Scherm offline
1. Check fysieke verbinding (stroom, internet)
2. Check Yodeck dashboard
3. Herstart de player via Yodeck

### Factuur niet verstuurd
1. Check of SendGrid API key correct is
2. Bekijk logs in Replit Shell
3. Verstuur handmatig via `/billing`

### Inloggen werkt niet
1. Clear browser cache
2. Probeer incognito venster
3. Check of Replit Auth actief is

### App laadt niet
1. Check Replit deployment status
2. Klik "Redeploy" indien nodig
3. Bekijk logs voor errors

### Database errors
1. Ga naar Shell in Replit
2. Run: `npm run db:push` om schema te synchroniseren
3. Bij blijvende problemen: rollback naar checkpoint

---

## Belangrijke Bestanden

### Frontend
| Bestand | Wat het doet |
|---------|--------------|
| `client/src/pages/Landing.tsx` | Publieke website |
| `client/src/pages/Overview.tsx` | Dashboard homepage |
| `client/src/App.tsx` | Alle routes/pagina's |
| `client/src/components/layout/AppSidebar.tsx` | Navigatiemenu |
| `client/index.html` | SEO meta tags |

### Backend
| Bestand | Wat het doet |
|---------|--------------|
| `server/routes.ts` | Alle API endpoints |
| `server/storage.ts` | Database operaties |
| `server/email.ts` | Email verzenden |
| `shared/schema.ts` | Database structuur |

### Configuratie
| Bestand | Wat het doet |
|---------|--------------|
| `replit.md` | Project documentatie |
| `package.json` | Dependencies |
| `drizzle.config.ts` | Database configuratie |

---

## Secrets & Environment Variables

### Benodigde Secrets (in Replit Secrets tab)
| Naam | Beschrijving | Waar te krijgen |
|------|--------------|-----------------|
| `SENDGRID_API_KEY` | Email versturen | sendgrid.com |
| `YODECK_API_TOKEN` | Schermen sync | yodeck.com settings |
| `MONEYBIRD_API_TOKEN` | Boekhouding | moneybird.com instellingen |

### Automatisch ingesteld door Replit
| Naam | Beschrijving |
|------|--------------|
| `DATABASE_URL` | PostgreSQL database |
| `REPLIT_DEPLOYMENT_ID` | Deployment identificatie |
| `SESSION_SECRET` | Sessie beveiliging |

---

## Support & Hulp

### Replit Support
- Klik op "?" icoon in Replit
- Community: https://ask.replit.com

### Code aanpassen
- Vraag AI Agent in Replit om hulp
- Beschrijf wat je wilt veranderen
- Agent past de code aan

### Backup van hele project
1. In Replit: klik op de drie puntjes naast projectnaam
2. Kies "Download as zip"
3. Dit bevat alle code (niet de database)

---

## Mobiel Gebruik

### Elevizion op je iPhone/iPad

De app werkt volledig op mobiel en kan als "app" op je homescreen worden gezet:

**Toevoegen aan homescreen:**
1. Open de URL in Safari (niet Chrome)
2. Tik op het Deel-icoon (vierkantje met pijl omhoog)
3. Scroll naar beneden
4. Kies "Zet op beginscherm"
5. Geef het een naam ("Elevizion") en tik "Voeg toe"

**Voordelen:**
- Opent als volwaardige app (geen browser balk)
- Snelle toegang vanaf homescreen
- Alle functies beschikbaar
- Push notificaties mogelijk (toekomstige feature)

**Navigatie op mobiel:**
- Tik op ☰ (hamburger menu) linksboven
- Menu schuift uit als lade
- Tik erbuiten om te sluiten
- Aandachtspunten zijn inklapbaar voor meer ruimte

**Tip:** Voeg de app toe op je telefoon zodat je onderweg snel kunt checken of alle schermen online zijn!

---

*Laatst bijgewerkt: December 2025*
