import PageHeader from '@/components/page-header';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Mail, Phone, User, Store, Truck } from 'lucide-react';

// Ayuda en vidrio (rediseño 9/11/2026): una tarjeta por tipo de cuenta con el ícono en un
// cuadradito, preguntas con filas de 48 px y el texto en voseo, con los nombres de botones y
// secciones que la app usa hoy.
const buyerFaqs = [
  {
    question: "¿Cómo repito un pedido?",
    answer: "Entrá a \"Mis Pedidos\", abrí un pedido que ya fue entregado y tocá \"Volver a pedir\". Los mismos productos se suman a tu carrito."
  },
  {
    question: "¿Puedo pedir a dos tiendas a la vez?",
    answer: "No: el carrito es de una tienda por vez. Si agregás algo de otra tienda, la app te pregunta si querés vaciar el carrito actual para empezar uno nuevo."
  },
  {
    question: "¿Cómo califico una tienda o al repartidor?",
    answer: "Cuando el pedido figura como \"Entregado\", en el detalle del pedido vas a ver las opciones para calificar los productos, la tienda y al repartidor."
  }
];

const storeFaqs = [
    {
        question: "¿Cómo agrego o edito mis productos?",
        answer: "En el menú, entrá a \"Gestionar Productos\". Con \"Nuevo Producto\" cargás uno, y en cada producto tenés los botones para editarlo o borrarlo."
    },
    {
        question: "¿Cómo ordeno los productos por categoría?",
        answer: "En el menú, entrá a \"Categorías\". Ahí agregás, cambiás o borrás las secciones que se ven en el menú de tu tienda."
    },
    {
        question: "¿Qué significa cada estado de un pedido?",
        answer: "\"Pendiente de Confirmación\": un pedido nuevo que tenés que aceptar o rechazar. \"En preparación\": lo confirmaste y el cliente pagó; es momento de prepararlo. \"En reparto\": el repartidor ya lo retiró. \"Entregado\": el pedido llegó."
    }
];

const deliveryFaqs = [
    {
        question: "¿Cómo tomo un pedido?",
        answer: "En \"Panel de Entregas\", la pestaña \"Disponibles\" muestra los pedidos listos para retirar en las tiendas, con la zona, los kilómetros y los minutos de viaje. Tocá el botón para tomarlo y queda asignado a vos."
    },
    {
        question: "¿Dónde veo los pedidos que estoy llevando?",
        answer: "En \"Panel de Entregas\", pestaña \"En curso\": ahí están los pedidos que tomaste, con la dirección de destino y el botón para navegar."
    },
     {
        question: "¿Cómo marco que ya entregué?",
        answer: "Cuando le das el pedido al cliente, tocá \"Ya lo entregué\" en la tarjeta del pedido y escribí el código de entrega de 4 números que te dice el cliente."
    }
];

const SECTIONS = [
  { id: 'buyer', title: 'Para clientes', Icon: User, faqs: buyerFaqs },
  { id: 'store', title: 'Para tiendas', Icon: Store, faqs: storeFaqs },
  { id: 'delivery', title: 'Para repartidores', Icon: Truck, faqs: deliveryFaqs },
];

export default function SupportPage() {
  return (
    <div className="container mx-auto">
      <PageHeader title="Ayuda y soporte" description="Encontrá respuestas a las preguntas más comunes o escribinos." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="space-y-5 lg:col-span-2">
          {SECTIONS.map(({ id, title, Icon, faqs }) => (
            <Card key={id} data-testid={`support-${id}`}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-3 font-headline text-2xl">
                  <span className="cat-tile tile-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.9rem]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  {title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible>
                  {faqs.map((faq, index) => (
                    <AccordionItem key={`${id}-${index}`} value={`${id}-item-${index}`} className="border-foreground/10 last:border-b-0">
                      <AccordionTrigger className="min-h-12 gap-3 text-left text-base font-semibold hover:no-underline">{faq.question}</AccordionTrigger>
                      <AccordionContent className="text-base leading-relaxed text-muted-foreground">{faq.answer}</AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="lg:col-span-1">
          <Card className="glass-strong lg:sticky lg:top-[5.5rem]" data-testid="support-contact">
            <CardHeader>
              <CardTitle className="font-headline text-2xl">¿Necesitás más ayuda?</CardTitle>
              <CardDescription className="text-base">Si no encontrás la respuesta acá, escribinos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <a
                href="mailto:soporte@encomiendaya.test"
                className="flex min-h-12 items-center gap-3 rounded-2xl bg-foreground/5 px-3 font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                <Mail className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="break-all">soporte@encomiendaya.test</span>
              </a>
              <div className="flex min-h-12 items-center gap-3 rounded-2xl bg-foreground/5 px-3 text-muted-foreground">
                <Phone className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>+1 (555) 123-4567 (simulado)</span>
              </div>
              <p className="pt-2 text-sm text-muted-foreground">Próximamente: un formulario para mandarnos tu consulta desde acá.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
