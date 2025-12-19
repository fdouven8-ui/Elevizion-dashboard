import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, MapPin, Monitor, FileText, Receipt, Wallet, 
  Camera, BarChart3, Users, Settings, Download, Shield,
  CheckCircle, HelpCircle, Smartphone, UserPlus, ClipboardList, ClipboardCheck, Sparkles, Footprints,
  LayoutDashboard, Rocket, Target, Zap, Bell, MessageSquare
} from "lucide-react";

const sections = [
  {
    id: "intro",
    icon: <Footprints className="h-5 w-5" />,
    title: "Waar Begin Ik?",
    description: "De eerste stappen in Elevizion",
    badge: "Start hier",
    content: `
      Welkom bij Elevizion! Dit is de volgorde waarin je het systeem het beste kunt gebruiken:
      
      **1. Nieuwe klanten werven:**
      • Gebruik de Cold Walk-in wizard voor snelle onboarding in het veld
      • Of voeg leads toe via Acquisitie en werk ze stap voor stap af
      
      **2. Systeem inrichten:**
      • Voeg locaties toe waar schermen komen
      • Registreer adverteerders die willen adverteren
      • Koppel schermen aan locaties
      
      **3. Dagelijks werk:**
      • Bekijk de Control Room (Home) voor een real-time overzicht
      • Gebruik de "Snelle Acties" knop rechtsboven voor veelgebruikte taken
      • Bekijk en los FIX NOW alerts direct op
      
      **4. Maandelijkse administratie:**
      • Voer maandafsluiting uit
      • Controleer facturen
      • Betaal locatie-eigenaren uit
      
      Tip: Lees hieronder verder per onderwerp!
    `,
  },
  {
    id: "navigatie",
    icon: <LayoutDashboard className="h-5 w-5" />,
    title: "Navigatie",
    description: "De 6 hoofdonderdelen van Elevizion",
    badge: "Nieuw",
    content: `
      De sidebar bevat 6 hoofdonderdelen:
      
      **1. Home (Control Room)**
      • Real-time statuskaarten: Online, Offline, Ads Live, Lege schermen, Issues, Betaalrisico
      • FIX NOW sectie met hoogste prioriteit alerts (inklapbaar)
      • Dagelijkse checklist met taken
      • Netwerk gezondheid overzicht
      
      **2. Onboarding**
      • Wizards voor nieuwe schermen, adverteerders en plaatsingen
      • Cold Walk-in wizard voor snelle registratie in het veld
      
      **3. Schermen**
      • Alle fysieke displays beheren
      • Status bijhouden (online/offline)
      • SCREEN_ID (EVZ-001 formaat) als centrale identifier
      
      **4. Adverteerders**
      • Bedrijven die adverteren beheren
      • Contract status per adverteerder
      • SEPA machtiging instellen
      
      **5. Plaatsingen**
      • Welke ad draait op welk scherm
      • Instellingen per plaatsing (seconden, frequentie)
      
      **6. Instellingen**
      • Automations: Automatische alerts en regels
      • Templates: Berichten voor WhatsApp, Email, etc.
      • Gebruikers: Toegangsbeheer
      • Integraties: Yodeck, Moneybird koppeling
      • Finance: Pakketprijzen en facturatie-instellingen
    `,
  },
  {
    id: "control-room",
    icon: <Zap className="h-5 w-5" />,
    title: "Control Room (Home)",
    description: "Je commandocentrum voor dagelijks werk",
    badge: "Verbeterd",
    content: `
      De Control Room is je startpagina met alles wat je direct moet weten.
      
      **Statuskaarten (2x3 grid)**
      • Online/Offline - Hoeveel schermen werken
      • Ads Live - Aantal actieve advertenties
      • Leeg (<20) - Schermen met te weinig content
      • Issues - Openstaande problemen
      • Betaalrisico - Adverteerders met betalingsachterstand
      
      **Snelle Acties (dropdown rechtsboven)**
      • Nieuw Scherm toevoegen
      • Nieuwe Adverteerder registreren
      • Creative uploaden
      • Ad plaatsen
      
      **FIX NOW sectie (inklapbaar)**
      • Hoogste prioriteit alerts
      • Maximaal 5 items tegelijk
      • Direct actieknoppen per alert
      • Nieuwe alerts krijgen een animatie
      
      **Dagelijkse Checklist**
      • Taken voor vandaag
      • Klik om direct naar de juiste plek te gaan
      
      **Netwerk Gezondheid**
      • Percentage schermen online
      • Overzicht actieve/offline schermen
    `,
  },
  {
    id: "cold-walkin",
    icon: <Sparkles className="h-5 w-5" />,
    title: "Cold Walk-in Wizard",
    description: "Nieuwe klant in 2 minuten registreren",
    content: `
      De snelste manier om een nieuwe klant toe te voegen, direct vanuit het veld.
      
      **Waar vind je het?**
      Onboarding → Klik op de groene "Cold Walk-in" kaart
      
      **Drie opties:**
      • **Locatie Partner** - Een plek die schermen wil hosten
      • **Adverteerder** - Een bedrijf dat wil adverteren
      • **Beide** - Locatie wordt ook adverteerder (snelle deal!)
      
      **Stappen in de wizard:**
      1. Kies het type (locatie, adverteerder, of beide)
      2. Vul bedrijfsgegevens in (naam, contact, adres)
      3. Voor locaties: vul de schouw-checklist in (WiFi, stroom, montage)
      4. Configureer de schermen
      5. Voor adverteerders: stel het contract in
      6. Bevestig en klaar!
      
      **Wat gebeurt er automatisch?**
      • Locatie + schermen worden aangemaakt
      • Schouw-rapport wordt opgeslagen
      • Installatie- en inkooptaken worden aangemaakt
      • Adverteerder + contract worden aangemaakt (indien gekozen)
      
      **Tip:** WiFi wachtwoorden worden versleuteld opgeslagen!
    `,
  },
  {
    id: "automations",
    icon: <Bell className="h-5 w-5" />,
    title: "Automations",
    description: "Automatische alerts en regels",
    badge: "Nieuw",
    content: `
      Stel regels in die automatisch acties uitvoeren.
      
      **Waar vind je het?**
      Instellingen → Automations tab
      
      **Beschikbare regels:**
      • **Scherm Offline Alert** - Stuur een melding als een scherm offline gaat
      • **Lege Inventaris Waarschuwing** - Alert als scherm te weinig content heeft
      • **Plaatsing Verloopt** - Waarschuwing voordat een plaatsing eindigt
      • **Betaling Te Laat** - Herinnering voor openstaande facturen
      
      **Hoe werkt het?**
      1. Zet een regel aan met de schakelaar
      2. Configureer drempels (bijv. na 15 minuten offline)
      3. Alerts verschijnen in de FIX NOW sectie op Home
    `,
  },
  {
    id: "templates",
    icon: <MessageSquare className="h-5 w-5" />,
    title: "Templates",
    description: "Standaard berichten voor klantcommunicatie",
    badge: "Nieuw",
    content: `
      Maak herbruikbare berichten voor WhatsApp, email en contracten.
      
      **Waar vind je het?**
      Instellingen → Templates tab
      
      **Categorieën:**
      • WhatsApp - Snelle berichten naar klanten
      • Email - Formele communicatie
      • Contract - Contractteksten
      • Factuur - Betalingsherinneringen
      • Intern - Notities voor collega's
      
      **Velden invoegen:**
      • Klik op de veldknoppen om dynamische content toe te voegen
      • Beschikbaar: Bedrijfsnaam, Contactpersoon, Telefoon, Email, etc.
      • Velden worden automatisch ingevuld bij verzenden
      
      **Template gebruiken:**
      1. Ga naar een adverteerder
      2. Klik op WhatsApp of Email knop
      3. Kies een template
      4. Bekijk de preview met ingevulde gegevens
      5. Verzend of kopieer naar klembord
      
      **Versioning:**
      • Templates bewaren de laatste 5 versies
      • Herstel een oudere versie indien nodig
    `,
  },
  {
    id: "acquisitie",
    icon: <UserPlus className="h-5 w-5" />,
    title: "Acquisitie (Leads)",
    description: "Potentiële klanten beheren",
    content: `
      Hier beheer je alle potentiële klanten (leads) in een visueel overzicht.
      
      **Wanneer gebruik je dit?**
      Als je een lead wilt opvolgen over meerdere dagen/weken, gebruik je het Acquisitie bord.
      Voor snelle registratie in het veld, gebruik de Cold Walk-in wizard.
      
      **Kanban bord:**
      • Leads worden weergegeven als kaarten in kolommen
      • Sleep kaarten naar andere kolommen om de status te wijzigen
      • Kolommen: Nieuw → Contact → Schouw Gepland → Voorstel → Onderhandeling → Gewonnen/Verloren
      
      **Lead types:**
      • **Adverteerder** - Bedrijf dat wil adverteren
      • **Locatie** - Plek die een scherm wil hosten
      
      **Workflow:**
      1. Voeg een nieuwe lead toe met de knop rechtsboven
      2. Plan een afspraak en zet de status op "Contact"
      3. Voor locaties: plan een schouw en zet op "Schouw Gepland"
      4. Na de schouw: converteer de lead naar adverteerder of locatie
    `,
  },
  {
    id: "schouwen",
    icon: <ClipboardCheck className="h-5 w-5" />,
    title: "Schouwen (Locatie-inspectie)",
    description: "Technische inspecties van potentiële locaties",
    content: `
      Een schouw is een technische inspectie van een locatie voordat je er schermen plaatst.
      
      **Schouw formulier:**
      • Technische checklist: WiFi, stroom, montagemogelijkheden
      • Drukte-inschatting en doelgroep
      • Voorgesteld aantal schermen
      • Geschatte installatiekosten
      
      **Foto's toevoegen:**
      • Upload foto's met categorieën: locatie, technisch, montage, overig
      • Maak foto's van de plek waar schermen komen
      • Documenteer eventuele obstakels of bijzonderheden
      
      **Benodigdheden specificeren:**
      • Voeg materialen toe die nodig zijn voor installatie
      • Bijv: TV's, HDMI kabels, kabelgoten, montagebeugels
      • Specificeer hoeveelheden per item
      
      **Schouw afronden:**
      • Klik op "Schouw Afronden & Taken Aanmaken"
      • Systeem maakt automatisch taken aan:
        - Installatietaak → voor bouwvakker (ops)
        - Inkooptaak → voor inkoop (admin)
      • Lead status wordt automatisch bijgewerkt
    `,
  },
  {
    id: "taken",
    icon: <ClipboardList className="h-5 w-5" />,
    title: "Taken",
    description: "Werkzaamheden beheren en toewijzen",
    content: `
      Alle taken voor het team op één plek beheren.
      
      **Taaktypes:**
      • **Installatie** - Schermen ophangen en aansluiten (→ ops team)
      • **Inkoop** - Materialen bestellen (→ admin)
      • **Onderhoud** - Reparaties en onderhoud
      • **Administratief** - Overige taken
      
      **Taakstatussen:**
      • **Open** - Nog niet gestart
      • **In uitvoering** - Mee bezig
      • **Afgerond** - Klaar
      
      **Filteren:**
      • Filter op rol: Alle, Ops, Admin, Finance
      • Bekijk open taken of afgeronde taken via de tabs
      
      **Vanuit schouw of wizard:**
      Taken worden automatisch aangemaakt wanneer je een schouw afrondt of de Cold Walk-in wizard voltooit. 
      De materiaallijst wordt automatisch toegevoegd aan de taken.
    `,
  },
  {
    id: "locaties",
    icon: <MapPin className="h-5 w-5" />,
    title: "Locaties",
    description: "Plekken waar je schermen hangen",
    content: `
      Locaties zijn de plekken waar je schermen hangen, zoals winkels, stations of kantoren.
      
      **Wat kun je doen?**
      • Nieuwe locatie toevoegen
      • Instellingen voor omzetdeling aanpassen
      • Contactgegevens van de locatiebeheerder opslaan
      
      **Belangrijke velden:**
      • **Omzetdeling (%)** - Hoeveel procent van de reclame-inkomsten naar de locatie gaat (standaard 10%)
      • **Minimum uitbetaling** - Onder dit bedrag wordt niet uitbetaald (wordt doorgeschoven)
      • **IBAN** - Bankrekeningnummer voor uitbetalingen
      • **KvK-nummer** - Voor de administratie
      • **Adres, postcode, plaats** - Waar de schermen hangen
    `,
  },
  {
    id: "adverteerders",
    icon: <Building2 className="h-5 w-5" />,
    title: "Adverteerders",
    description: "Bedrijven die reclame maken op je schermen",
    content: `
      Hier beheer je alle bedrijven die bij jou adverteren.
      
      **Wat kun je doen?**
      • Nieuwe adverteerder toevoegen met de "Nieuwe Adverteerder" knop
      • Gegevens bekijken en aanpassen (naam, email, BTW-nummer)
      • Status wijzigen (actief, gepauzeerd)
      • Automatisch incasso instellen (SEPA)
      
      **Contract Status (bovenaan detail pagina):**
      • Reclamecontract - Status en verstuur/kopieer acties
      • SEPA Machtiging - Status met verstuur/download opties
      • Voortgang indicator (0/2, 1/2, 2/2 getekend)
      
      **Template berichten:**
      • Klik op WhatsApp of Email knop
      • Kies een template met vooraf ingevulde gegevens
      • Bekijk preview en verzend
      
      **Automatisch Incasso (SEPA):**
      • Klik op ⋮ → "Incasso instellen" bij een adverteerder
      • Vul het IBAN rekeningnummer in
      • Vink aan dat de machtiging is getekend
      • Facturen worden dan automatisch geïncasseerd via Moneybird
    `,
  },
  {
    id: "schermen",
    icon: <Monitor className="h-5 w-5" />,
    title: "Schermen",
    description: "De fysieke displays die content tonen",
    content: `
      Elk scherm is een fysieke display op een locatie. Schermen worden gekoppeld aan een locatie.
      
      **SCREEN_ID (EVZ-001 formaat):**
      Dit is de centrale identifier in het hele systeem. Elk scherm heeft een unieke ID in dit formaat.
      
      **Status betekenissen:**
      • 🟢 **Online** - Scherm werkt en speelt content af
      • 🔴 **Offline** - Scherm is niet bereikbaar (check de internetverbinding)
      
      **Wat kun je doen?**
      • Schermen toevoegen aan locaties
      • Schermstatus bekijken
      • Yodeck player koppelen (voor automatische synchronisatie)
      
      **Installatiestatus:**
      • **Gepland** - Scherm moet nog geïnstalleerd worden
      • **Geïnstalleerd** - Scherm hangt, maar speelt nog geen content
      • **Live** - Scherm is volledig operationeel
    `,
  },
  {
    id: "plaatsingen",
    icon: <Target className="h-5 w-5" />,
    title: "Plaatsingen",
    description: "Welke advertentie draait op welk scherm",
    content: `
      Plaatsingen bepalen welke reclame op welk scherm draait.
      
      **Wat is een plaatsing?**
      Een plaatsing koppelt een contract aan een specifiek scherm. Zo weet het systeem welke reclame waar moet draaien.
      
      **Instellingen:**
      • **Seconden per loop** - Hoe lang de advertentie per keer te zien is
      • **Afspeelmomenten per uur** - Hoe vaak per uur de advertentie wordt getoond
      
      **Automatisch aanmaken:**
      Als je in de Cold Walk-in wizard "Beide" kiest (locatie + adverteerder), worden plaatsingen automatisch aangemaakt voor alle nieuwe schermen.
    `,
  },
  {
    id: "contracten",
    icon: <FileText className="h-5 w-5" />,
    title: "Contracten",
    description: "Afspraken met adverteerders",
    content: `
      Een contract is de afspraak met een adverteerder: wat kost het, hoe lang loopt het, op welke schermen.
      
      **Contract aanmaken:**
      1. Kies een adverteerder
      2. Kies een pakket (of maak een aangepast contract)
      3. Stel de looptijd in (start- en einddatum)
      4. Koppel schermen via plaatsingen
      
      **Contract status:**
      • **Actief** - Contract loopt, advertenties draaien
      • **Concept** - Contract is aangemaakt maar nog niet actief
      • **Verlopen** - Einddatum is gepasseerd
      
      **Tip:** Via de Cold Walk-in wizard kun je direct een contract aanmaken bij een nieuwe klant!
    `,
  },
  {
    id: "facturatie",
    icon: <Receipt className="h-5 w-5" />,
    title: "Facturatie",
    description: "Facturen naar adverteerders",
    content: `
      Hier beheer je alle facturen naar adverteerders.
      
      **Factuur statussen:**
      • **Concept** - Factuur is aangemaakt maar nog niet verstuurd
      • **Verzonden** - Factuur is naar de klant gestuurd
      • **Betaald** - Klant heeft betaald
      • **Te laat** - Vervaldatum is gepasseerd
      
      **Betaalmethode:**
      • **Incasso** - Wordt automatisch geïncasseerd (groen icoontje)
      • **Overboeking** - Klant moet zelf overmaken
      
      **Workflow:**
      1. Maandafsluiting genereert automatisch facturen
      2. Controleer de facturen
      3. Verstuur naar klanten (via Moneybird)
      4. Bij incasso: wordt automatisch afgeschreven
      5. Bij overboeking: markeer als betaald wanneer geld binnen is
      
      **Tip:** Stel automatisch incasso in bij adverteerders voor minder administratie!
    `,
  },
  {
    id: "uitbetalingen",
    icon: <Wallet className="h-5 w-5" />,
    title: "Uitbetalingen",
    description: "Betalingen aan locatie-eigenaren",
    content: `
      Locaties krijgen een deel van de reclame-inkomsten. Dit beheer je hier.
      
      **Hoe werkt het?**
      1. Het systeem berekent automatisch de omzetdeling per locatie
      2. Als het bedrag boven het minimum ligt, wordt een uitbetaling aangemaakt
      3. Onder het minimum wordt het bedrag doorgeschoven naar volgende maand
      
      **Uitbetaling doen:**
      1. Bekijk het openstaande bedrag
      2. Maak de betaling over naar het IBAN van de locatie
      3. Markeer de uitbetaling als "Betaald"
    `,
  },
  {
    id: "maandafsluiting",
    icon: <CheckCircle className="h-5 w-5" />,
    title: "Maandafsluiting",
    description: "Elke maand afsluiten en factureren",
    content: `
      Aan het einde van elke maand sluit je de administratie af.
      
      **Stappen:**
      1. **Snapshot maken** - Bevriest alle gegevens van de maand
      2. **Facturen genereren** - Maakt facturen aan voor alle actieve contracten
      3. **Uitbetalingen berekenen** - Berekent wat elke locatie krijgt
      4. **Afsluiten** - Sluit de maand definitief af
      
      **Waarom is dit belangrijk?**
      De maandafsluiting zorgt dat je achteraf altijd kunt bewijzen welke afspraken er waren, ongeacht latere wijzigingen.
      
      **Wanneer uitvoeren?**
      Voer de maandafsluiting uit in de eerste week van de nieuwe maand. Bijvoorbeeld: sluit december af in de eerste week van januari.
    `,
  },
  {
    id: "gebruikers",
    icon: <Users className="h-5 w-5" />,
    title: "Gebruikers",
    description: "Wie heeft toegang tot het systeem",
    content: `
      Beheer wie toegang heeft tot Elevizion en wat ze mogen doen.
      
      **Rollen:**
      • **Admin** - Volledige toegang tot alles
      • **Finance** - Toegang tot facturatie en betalingen
      • **Ops** - Toegang tot schermen en monitoring
      • **Viewer** - Alleen kijken, niets aanpassen
      • **Partner** - Alleen eigen locatiegegevens zien
      
      **Nieuwe gebruiker:**
      Gebruikers krijgen automatisch toegang via Replit login. Als admin kun je hun rol aanpassen.
    `,
  },
  {
    id: "backup",
    icon: <Download className="h-5 w-5" />,
    title: "Backup & Export",
    description: "Gegevens veilig opslaan",
    content: `
      Maak regelmatig een backup om je gegevens te beschermen.
      
      **Volledige backup:**
      Download alles in één bestand. Dit kun je gebruiken om je systeem te herstellen.
      
      **Per onderdeel:**
      Download alleen specifieke gegevens (bv. alleen facturen) als JSON of CSV.
      
      **Tips:**
      • Maak minimaal eens per week een backup
      • Bewaar backups op meerdere plekken
      • CSV bestanden kun je openen in Excel
    `,
  },
  {
    id: "mobiel",
    icon: <Smartphone className="h-5 w-5" />,
    title: "Mobiel Gebruik",
    description: "Elevizion op je telefoon of tablet",
    content: `
      Elevizion werkt volledig op je telefoon of tablet.
      
      **Als app op je iPhone/iPad:**
      1. Open de site in Safari
      2. Tik op het Deel-icoon (vierkantje met pijl)
      3. Kies "Zet op beginscherm"
      4. Geef het een naam en tik "Voeg toe"
      
      **Navigatie op mobiel:**
      • Tik op het menu-icoon linksboven (☰)
      • Het menu schuift uit als een lade
      • De sidebar is compacter op mobiel
      • Tik ergens anders om het menu te sluiten
      
      **Tips:**
      • Alle functies werken hetzelfde als op desktop
      • Gebruik de Cold Walk-in wizard voor snelle registraties in het veld
      • De Control Room statuskaarten zijn geoptimaliseerd voor mobiel (2x3 grid)
      • Snelle Acties dropdown rechtsboven werkt perfect op mobiel
    `,
  },
];

export default function Handleiding() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold" data-testid="page-title">Handleiding</h1>
        <p className="text-sm text-muted-foreground">
          Leer hoe je Elevizion gebruikt - in de volgorde waarin je het nodig hebt
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Sparkles className="h-8 w-8 text-green-600" />
              <div>
                <p className="font-medium">Nieuw hier?</p>
                <p className="text-sm text-muted-foreground">Begin met "Waar Begin Ik?"</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <HelpCircle className="h-8 w-8 text-blue-600" />
              <div>
                <p className="font-medium">6 hoofdonderdelen</p>
                <p className="text-sm text-muted-foreground">Home → Instellingen</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-amber-600" />
              <div>
                <p className="font-medium">Backup belangrijk</p>
                <p className="text-sm text-muted-foreground">Maak regelmatig een backup!</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Alle Functies Uitgelegd</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Van klantwerving tot administratie - in de volgorde waarin je het nodig hebt
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {sections.map((section) => (
              <AccordionItem key={section.id} value={section.id} data-testid={`accordion-${section.id}`}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted/40">
                      {section.icon}
                    </div>
                    <div className="text-left flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{section.title}</p>
                        {"badge" in section && section.badge && (
                          <Badge variant="secondary" className="text-xs">
                            {section.badge}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground font-normal">{section.description}</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pl-13 pt-2 prose prose-sm max-w-none">
                    {section.content.split("\n").map((line, i) => {
                      if (line.includes("**") && line.includes("**")) {
                        const parts = line.split("**");
                        return (
                          <p key={i} className="mb-2">
                            {parts.map((part, j) => 
                              j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                            )}
                          </p>
                        );
                      }
                      if (line.trim().startsWith("•")) {
                        return (
                          <p key={i} className="mb-1 pl-4">
                            {line}
                          </p>
                        );
                      }
                      if (line.trim().match(/^\d\./)) {
                        return (
                          <p key={i} className="mb-1 pl-4">
                            {line.trim()}
                          </p>
                        );
                      }
                      if (line.trim()) {
                        return <p key={i} className="mb-2">{line.trim()}</p>;
                      }
                      return null;
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            <p className="mb-2">Nog vragen of suggesties?</p>
            <p className="text-sm">Neem contact op met <strong>support@elevizion.nl</strong></p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
