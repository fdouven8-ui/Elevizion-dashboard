import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, MapPin, Monitor, FileText, Receipt, Wallet, 
  Camera, BarChart3, Users, Settings, Download, Shield,
  CheckCircle, AlertCircle, HelpCircle, Smartphone
} from "lucide-react";

const sections = [
  {
    id: "dashboard",
    icon: <BarChart3 className="h-5 w-5" />,
    title: "Dashboard (Overzicht)",
    description: "Je startpagina met alle belangrijke cijfers",
    content: `
      Het dashboard laat in één oogopslag zien hoe je bedrijf draait:
      
      **Aandachtspunten:**
      • Bovenaan zie je direct wat er aandacht nodig heeft
      • Offline schermen, openstaande facturen, schermen zonder ads
      • Klik op "Aandachtspunten" om in/uit te klappen
      • Elke melding heeft een directe actieknop
      
      **Statistieken:**
      • Schermen online - Klik om naar schermbeheer te gaan
      • Actieve campagnes - Klik voor advertentie-overzicht
      • Openstaande facturen - Klik naar facturatie
      • Actieve adverteerders - Klik naar adverteerdersbeheer
      
      Alle kaarten zijn klikbaar en brengen je direct naar de juiste plek!
    `,
  },
  {
    id: "adverteerders",
    icon: <Building2 className="h-5 w-5" />,
    title: "Adverteerders",
    description: "Bedrijven die reclame maken op je schermen",
    content: `
      Hier beheer je alle bedrijven die bij jou adverteren:
      
      **Wat kun je doen?**
      • Nieuwe adverteerder toevoegen met de "Nieuwe Adverteerder" knop
      • Gegevens bekijken en aanpassen (naam, email, BTW-nummer)
      • Status wijzigen (actief, gepauzeerd)
      • Automatisch incasso instellen (SEPA)
      
      **Belangrijke velden:**
      • **Bedrijfsnaam** - De officiële naam van het bedrijf
      • **Contactpersoon** - Met wie je contact hebt
      • **Email** - Waar facturen naartoe gaan
      • **BTW-nummer** - Nodig voor de factuur
      
      **Automatisch Incasso (SEPA):**
      • Klik op ⋮ → "Incasso instellen" bij een adverteerder
      • Vul het IBAN rekeningnummer in
      • Vink aan dat de machtiging is getekend
      • Facturen worden dan automatisch geïncasseerd via Moneybird
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
      • **Omzetdeling (%)** - Hoeveel procent van de reclame-inkomsten naar de locatie gaat
      • **Minimum uitbetaling** - Onder dit bedrag wordt niet uitbetaald (wordt doorgeschoven)
      • **IBAN** - Bankrekeningnummer voor uitbetalingen
    `,
  },
  {
    id: "schermen",
    icon: <Monitor className="h-5 w-5" />,
    title: "Schermen",
    description: "De fysieke displays die content tonen",
    content: `
      Elk scherm is een fysieke display op een locatie. Schermen worden gekoppeld aan een locatie.
      
      **Status betekenissen:**
      • 🟢 **Online** - Scherm werkt en speelt content af
      • 🔴 **Offline** - Scherm is niet bereikbaar (check de internetverbinding)
      
      **Wat kun je doen?**
      • Schermen toevoegen aan locaties
      • Schermstatus bekijken
      • Yodeck player koppelen (voor automatische synchronisatie)
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
      
      **Contract ondertekenen:**
      • Stuur het contract digitaal naar de klant
      • De klant kan online ondertekenen
      • Je krijgt een bevestiging als het is ondertekend
    `,
  },
  {
    id: "plaatsingen",
    icon: <Camera className="h-5 w-5" />,
    title: "Plaatsingen",
    description: "Welke advertentie draait op welk scherm",
    content: `
      Plaatsingen bepalen welke reclame op welk scherm draait.
      
      **Wat is een plaatsing?**
      Een plaatsing koppelt een contract aan een specifiek scherm. Zo weet het systeem welke reclame waar moet draaien.
      
      **Instellingen:**
      • **Seconden per loop** - Hoe lang de advertentie per keer te zien is
      • **Afspeelmomenten per uur** - Hoe vaak per uur de advertentie wordt getoond
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
      • Tik ergens anders om het menu te sluiten
      
      **Tips:**
      • Alle functies werken hetzelfde als op desktop
      • Aandachtspunten zijn inklapbaar voor meer ruimte
      • Tabellen scrollen horizontaal op kleine schermen
    `,
  },
];

export default function Handleiding() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="page-title">Handleiding</h1>
        <p className="text-muted-foreground">
          Leer hoe je Elevizion gebruikt - stap voor stap uitgelegd
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <HelpCircle className="h-8 w-8 text-blue-600" />
              <div>
                <p className="font-medium">Hulp nodig?</p>
                <p className="text-sm text-muted-foreground">Klik op een onderwerp hieronder</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div>
                <p className="font-medium">Alles in het Nederlands</p>
                <p className="text-sm text-muted-foreground">Simpel en duidelijk uitgelegd</p>
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
          <CardTitle>Alle Functies Uitgelegd</CardTitle>
          <CardDescription>
            Klik op een onderwerp om meer te leren
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {sections.map((section) => (
              <AccordionItem key={section.id} value={section.id} data-testid={`accordion-${section.id}`}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
                      {section.icon}
                    </div>
                    <div className="text-left">
                      <p className="font-medium">{section.title}</p>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            Veelgemaakte Fouten
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-3 p-3 border rounded-lg">
              <Badge variant="destructive">Fout</Badge>
              <div>
                <p className="font-medium">Geen backup maken</p>
                <p className="text-sm text-muted-foreground">
                  Maak elke week een backup via Backup & Export. Zo verlies je nooit je gegevens.
                </p>
              </div>
            </div>
            <div className="flex gap-3 p-3 border rounded-lg">
              <Badge variant="destructive">Fout</Badge>
              <div>
                <p className="font-medium">Maandafsluiting overslaan</p>
                <p className="text-sm text-muted-foreground">
                  Sluit elke maand af via Maandafsluiting. Dit zorgt voor correcte facturen en uitbetalingen.
                </p>
              </div>
            </div>
            <div className="flex gap-3 p-3 border rounded-lg">
              <Badge variant="destructive">Fout</Badge>
              <div>
                <p className="font-medium">Schermstatus niet controleren</p>
                <p className="text-sm text-muted-foreground">
                  Check regelmatig of alle schermen online zijn via Monitoring. Offline schermen = geen reclame.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
