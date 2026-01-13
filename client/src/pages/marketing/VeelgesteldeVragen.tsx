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
    answer: "Onze pakketten beginnen bij €49,99 per maand (excl. BTW) voor 1 scherm. Het populairste pakket met 3 schermen kost €129,99 per maand. Voor 10 schermen betaal je €299,99 per maand. Bij alle pakketten is het ontwerp van je advertentie inbegrepen."
  },
  {
    question: "Hoe lang duurt het voordat mijn advertentie live staat?",
    answer: "Na aanmelding en akkoord maken wij binnen 1-2 werkdagen een ontwerp voor je. Zodra je het ontwerp goedkeurt, staat je advertentie binnen 24 uur op de schermen."
  },
  {
    question: "Kan ik mijn advertentie tussentijds aanpassen?",
    answer: "Ja, je kunt je content altijd laten aanpassen. Kleine wijzigingen (tekst, prijs) zijn gratis. Voor een volledig nieuw ontwerp rekenen we een kleine vergoeding."
  },
  {
    question: "Waar hangen de schermen?",
    answer: "Onze schermen hangen bij lokale ondernemers in Limburg: kapsalons, sportscholen, cafés, restaurants en winkels. We selecteren locaties op basis van bezoekersaantallen en zichtbaarheid."
  },
  {
    question: "Hoe weet ik dat mijn advertentie wordt getoond?",
    answer: "Je krijgt toegang tot een dashboard waar je kunt zien op welke schermen je advertentie draait. We monitoren alle schermen 24/7 en krijgen een melding als er iets niet werkt."
  },
  {
    question: "Moet ik zelf een video maken?",
    answer: "Nee, dat hoeft niet. Wij maken gratis een professionele video op basis van je logo, boodschap en eventuele foto's. Heb je zelf al een video? Dan plaatsen we die uiteraard."
  },
  {
    question: "Wat zijn de technische vereisten voor een video?",
    answer: "Een video moet 10-15 seconden duren, in MP4-formaat (H.264) en Full HD resolutie (1920x1080) zijn. De schermen staan op mute, dus audio wordt niet afgespeeld."
  },
  {
    question: "Kan ik opzeggen wanneer ik wil?",
    answer: "Ja, na de eerste maand is je pakket maandelijks opzegbaar. Er is geen lange contractduur of opzegtermijn. Je betaalt tot het einde van de lopende maand."
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
    answer: "Je kunt het contactformulier op onze website invullen, of direct een e-mail sturen. We reageren binnen 24 uur op werkdagen."
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
