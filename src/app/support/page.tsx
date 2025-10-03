
import PageHeader from '@/components/page-header';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Mail, Phone, User, Store, Truck } from 'lucide-react';

const buyerFaqs = [
  {
    question: "¿Cómo puedo repetir un pedido?",
    answer: "Ve a 'Mis Pedidos', selecciona un pedido que ya haya sido entregado y verás un botón de 'Volver a Pedir'. Esto añadirá todos los artículos de ese pedido a tu carrito."
  },
  {
    question: "¿Qué pasa si mi pedido es de una tienda diferente a la de mi carrito actual?",
    answer: "Solo puedes tener artículos de una tienda a la vez en tu carrito. Si intentas añadir un artículo de otra tienda, se te preguntará si quieres vaciar tu carrito actual para añadir el nuevo artículo."
  },
  {
    question: "¿Cómo puedo valorar un producto o una entrega?",
    answer: "Una vez que un pedido ha sido 'Entregado', en la página de detalles del pedido verás opciones para valorar tanto los productos individuales como la experiencia con el repartidor."
  }
];

const storeFaqs = [
    {
        question: "¿Cómo añado o edito mis productos?",
        answer: "Ve a 'Mi Tienda' > 'Productos' en el menú lateral. Desde allí podrás ver tu lista de productos. Usa el botón 'Añadir Artículo' para crear uno nuevo o los botones 'Editar' y 'Eliminar' en cada producto para gestionarlos."
    },
    {
        question: "¿Cómo gestiono las categorías de mis productos?",
        answer: "En el menú de 'Mi Tienda', selecciona 'Categorías'. En esta página podrás añadir, editar o eliminar las categorías que se muestran en la página de tu tienda."
    },
    {
        question: "¿Qué significan los diferentes estados de un pedido?",
        answer: "'Pendiente de Confirmación': Un nuevo pedido que debes aceptar o rechazar. 'En preparación': Has confirmado el pedido y el cliente ha pagado; es hora de prepararlo para el repartidor. 'En reparto': Un repartidor ha recogido el pedido. 'Entregado': El pedido ha sido completado."
    }
];

const deliveryFaqs = [
    {
        question: "¿Cómo acepto una nueva entrega?",
        answer: "En la sección 'Entregas', la pestaña 'Disponibles' te mostrará los pedidos que están listos para ser recogidos en las tiendas. Simplemente haz clic en 'Aceptar Pedido' para que se te asigne."
    },
    {
        question: "¿Dónde veo mis entregas activas?",
        answer: "En la sección 'Entregas', la pestaña 'Mis Entregas' mostrará todos los pedidos que has aceptado y que están actualmente 'En reparto'."
    },
     {
        question: "¿Cómo marco una entrega como completada?",
        answer: "Una vez que hayas entregado el pedido al cliente, ve a 'Mis Entregas' y busca el pedido correspondiente. Haz clic en el botón 'Marcar como Entregado' para finalizar el proceso."
    }
];


export default function SupportPage() {
  return (
    <div className="container mx-auto">
      <PageHeader title="Ayuda y Soporte" description="Encuentra respuestas a tus preguntas y contáctanos." />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><User /> Para Compradores</CardTitle>
                </CardHeader>
                <CardContent>
                    <Accordion type="single" collapsible>
                        {buyerFaqs.map((faq, index) => (
                        <AccordionItem key={`buyer-${index}`} value={`buyer-item-${index}`}>
                            <AccordionTrigger>{faq.question}</AccordionTrigger>
                            <AccordionContent>{faq.answer}</AccordionContent>
                        </AccordionItem>
                        ))}
                    </Accordion>
                </CardContent>
            </Card>

             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Store /> Para Tiendas</CardTitle>
                </CardHeader>
                <CardContent>
                    <Accordion type="single" collapsible>
                        {storeFaqs.map((faq, index) => (
                        <AccordionItem key={`store-${index}`} value={`store-item-${index}`}>
                            <AccordionTrigger>{faq.question}</AccordionTrigger>
                            <AccordionContent>{faq.answer}</AccordionContent>
                        </AccordionItem>
                        ))}
                    </Accordion>
                </CardContent>
            </Card>

             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Truck /> Para Repartidores</CardTitle>
                </CardHeader>
                <CardContent>
                    <Accordion type="single" collapsible>
                        {deliveryFaqs.map((faq, index) => (
                        <AccordionItem key={`delivery-${index}`} value={`delivery-item-${index}`}>
                            <AccordionTrigger>{faq.question}</AccordionTrigger>
                            <AccordionContent>{faq.answer}</AccordionContent>
                        </AccordionItem>
                        ))}
                    </Accordion>
                </CardContent>
            </Card>
        </div>

        <div className="lg:col-span-1">
            <Card>
                <CardHeader>
                    <CardTitle>¿Necesitas más ayuda?</CardTitle>
                    <CardDescription>Si no encuentras la respuesta aquí, contáctanos.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                        <a href="mailto:soporte@encomiendaya.test" className="text-primary hover:underline">
                            soporte@encomiendaya.test
                        </a>
                    </div>
                     <div className="flex items-center gap-3">
                        <Phone className="h-5 w-5 text-muted-foreground" />
                        <span>+1 (555) 123-4567 (simulado)</span>
                    </div>
                    <p className="text-sm text-muted-foreground pt-4">Próximamente: un formulario de contacto para enviar tus preguntas directamente desde aquí.</p>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
