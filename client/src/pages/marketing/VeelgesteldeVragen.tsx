import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

const faqItems = [
  {
    question: "Wat kost adverteren bij Elevizion?",
    answer: "Vanaf €30 per scherm / maand (bij 10 schermen). Meer schermen = lagere prijs per scherm. De startprijs voor 1 scherm is €49,99 per scherm / maand (excl. BTW). Minimale looptijd is 6 maanden, daarna maandelijks opzegbaar."
  },
  {
    question: "Maken jullie mijn advertentie?",
    answer: "Nee, je levert je advertentievideo zelf aan. Wij sturen je na akkoord duidelijke aanleverspecificaties (MP4, 1080p, 10-15 sec, 16:9) en je unieke linkKey. Wij plaatsen de video vervolgens op de schermen."
  },
  {
    question: "Welke video moet ik aanleveren?",
    answer: "Formaat: MP4 (H.264), resolutie 1920x1080 (Full HD, liggend 16:9), duur 10-15 seconden, zonder audio. Bestandsnaam: [linkKey]_Bedrijfsnaam.mp4. Je linkKey (bijv. ADV-001) ontvang je na akkoord."
  },
  {
    question: "Hoe lang duurt het voordat mijn advertentie live staat?",
    answer: "Zodra je video is aangeleverd en goedgekeurd, staat je advertentie binnen 24-48 uur op de schermen."
  },
  {
    question: "Wanneer kan ik opzeggen?",
    answer: "Na de minimale looptijd van 6 maanden kun je maandelijks opzeggen. Je betaalt tot het einde van de lopende maand."
  },
  {
    question: "Kan ik mijn video tussentijds vervangen?",
    answer: "Ja, je kunt je video altijd vervangen. Lever een nieuwe video aan via e-mail en wij plaatsen hem binnen 24-48 uur."
  },
  {
    question: "Waar hangen de schermen?",
    answer: "Onze schermen hangen bij lokale ondernemers in Limburg: kapsalons, sportscholen, cafés, restaurants en winkels. We selecteren locaties op basis van bezoekersaantallen en zichtbaarheid."
  },
  {
    question: "Hoe weet ik dat mijn advertentie wordt getoond?",
    answer: "We monitoren alle schermen 24/7 en krijgen een melding als er iets niet werkt. Je kunt altijd bij ons navragen op welke schermen je advertentie draait."
  },
  {
    question: "Wat kost een scherm op mijn locatie?",
    answer: "Bij voldoende bezoekers (minimaal 100-150 per week) is het scherm en de installatie meestal gratis. Je ontvangt daarnaast een maandelijkse vergoeding op basis van de advertentie-inkomsten."
  },
  {
    question: "Wie betaalt de stroom voor het scherm?",
    answer: "De stroomkosten zijn voor de locatie. Dit is ongeveer €2-3 per maand. In ruil ontvang je een vergoeding die ruim hoger is dan deze kosten."
  },
  {
    question: "Mag ik zelf bepalen welke advertenties op het scherm komen?",
    answer: "We zorgen ervoor dat alleen nette, professionele advertenties worden getoond. Concurrenten van jouw zaak worden niet op jouw scherm getoond. Je eigen promoties kunnen ook tussen de advertenties draaien."
  },
  {
    question: "Wat gebeurt er bij technische problemen?",
    answer: "Wij monitoren alle schermen op afstand. Bij problemen krijgen we automatisch een melding en lossen we het zo snel mogelijk op. Bij hardwareproblemen komen we langs om te repareren."
  },
  {
    question: "In welke regio's zijn jullie actief?",
    answer: "Momenteel zijn we actief in heel Limburg: Maastricht, Sittard-Geleen, Heerlen, Roermond, Venlo en omliggende plaatsen. We breiden continu uit naar nieuwe locaties."
  },
  {
    question: "Hoe neem ik contact op?",
    answer: "Je kunt het contactformulier op onze website invullen, of direct een e-mail sturen naar info@elevizion.nl. We reageren binnen 24 uur op werkdagen."
  },
  {
    question: "Krijg ik een factuur?",
    answer: "Ja, je ontvangt maandelijks een nette factuur met BTW-specificatie. Betaling gaat via automatische incasso of bankoverschrijving."
  }
];

export default function VeelgesteldeVragen() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingHeader />

      <section className="py-16 md:py-24 bg-gradient-to-b from-slate-50 to-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-6">
              <HelpCircle className="h-8 w-8" />
            </div>
            <h1 className="text-3xl md:text-5xl font-bold mb-6 text-slate-800">
              Veelgestelde vragen
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Antwoorden op de meest gestelde vragen over adverteren en schermlocaties.
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="space-y-3">
              {faqItems.map((item, index) => (
                <AccordionItem 
                  key={index} 
                  value={`item-${index}`} 
                  className="bg-white rounded-xl border-2 border-slate-200 px-5 hover:border-emerald-300 transition-colors"
                >
                  <AccordionTrigger className="text-left hover:no-underline text-base font-semibold text-slate-800 py-5">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-slate-600 text-sm pb-5 leading-relaxed">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Vraag niet beantwoord?
            </h2>
            <p className="text-slate-300 mb-8">
              Neem gerust contact met ons op. We helpen je graag verder.
            </p>
            <Button 
              size="lg" 
              className="gap-2 bg-emerald-500 hover:bg-emerald-600 font-semibold py-6 px-8"
              asChild
            >
              <Link href="/contact">
                Neem contact op
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
