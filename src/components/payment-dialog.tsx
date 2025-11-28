'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CreditCard, Lock, Calendar, Loader2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaymentDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  totalAmount: number;
  onPaymentSuccess: () => Promise<void>;
}

export function PaymentDialog({ isOpen, setIsOpen, totalAmount, onPaymentSuccess }: PaymentDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  // Estados del formulario
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [name, setName] = useState('');

  // Formatear número de tarjeta (0000 0000 0000 0000)
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 16) value = value.slice(0, 16);
    const formatted = value.replace(/(\d{4})(?=\d)/g, '$1 ');
    setCardNumber(formatted);
  };

  // Formatear fecha (MM/YY)
  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 4) value = value.slice(0, 4);
    if (value.length >= 2) {
      value = value.slice(0, 2) + '/' + value.slice(2);
    }
    setExpiry(value);
  };

  const handlePay = async () => {
    setIsLoading(true);
    
    // Simular procesamiento de red (2 segundos)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
        await onPaymentSuccess();
        setIsSuccess(true);
        // Cerrar después de mostrar éxito
        setTimeout(() => {
            setIsOpen(false);
            setIsSuccess(false);
            // Reset form
            setCardNumber('');
            setExpiry('');
            setCvc('');
            setName('');
        }, 1500);
    } catch (error) {
        console.error(error);
    } finally {
        setIsLoading(false);
    }
  };

  const isFormValid = cardNumber.length >= 19 && expiry.length === 5 && cvc.length === 3 && name.length > 3;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isLoading && !isSuccess && setIsOpen(open)}>
      <DialogContent className="sm:max-w-[425px]">
        {isSuccess ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-4 animate-in fade-in zoom-in duration-300">
                <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-center text-green-700">¡Pago Aprobado!</h2>
                <p className="text-center text-muted-foreground">Tu pedido ha sido procesado correctamente.</p>
            </div>
        ) : (
            <>
                <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" /> 
                    Pago Seguro
                </DialogTitle>
                <DialogDescription>
                    Ingresa los datos de tu tarjeta para procesar el pago de <strong>${totalAmount.toFixed(2)}</strong>.
                </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-4 py-4">
                    {/* Tarjeta Visual */}
                    <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 text-white shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-20">
                            <CreditCard className="h-24 w-24" />
                        </div>
                        <div className="relative z-10 space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-xs opacity-70">Tarjeta de Crédito</span>
                                <span className="font-bold tracking-widest italic">VISA</span>
                            </div>
                            <div className="text-xl font-mono tracking-wider">
                                {cardNumber || '0000 0000 0000 0000'}
                            </div>
                            <div className="flex justify-between text-xs opacity-80 pt-2">
                                <div className="flex flex-col">
                                    <span className="text-[10px]">Titular</span>
                                    <span className="font-semibold uppercase truncate max-w-[150px]">{name || 'NOMBRE APELLIDO'}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px]">Vence</span>
                                    <span className="font-semibold">{expiry || 'MM/YY'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="number">Número de Tarjeta</Label>
                        <div className="relative">
                            <CreditCard className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input 
                                id="number" 
                                placeholder="0000 0000 0000 0000" 
                                className="pl-9" 
                                value={cardNumber}
                                onChange={handleCardNumberChange}
                                maxLength={19}
                            />
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="name">Nombre del Titular</Label>
                        <Input 
                            id="name" 
                            placeholder="Como figura en la tarjeta" 
                            value={name}
                            onChange={(e) => setName(e.target.value.toUpperCase())}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="expiry">Vencimiento</Label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    id="expiry" 
                                    placeholder="MM/YY" 
                                    className="pl-9" 
                                    value={expiry}
                                    onChange={handleExpiryChange}
                                    maxLength={5}
                                />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="cvc">CVC</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    id="cvc" 
                                    placeholder="123" 
                                    type="password" 
                                    className="pl-9" 
                                    maxLength={3}
                                    value={cvc}
                                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, ''))}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading}>
                    Cancelar
                </Button>
                <Button 
                    onClick={handlePay} 
                    disabled={!isFormValid || isLoading}
                    className="bg-green-600 hover:bg-green-700 text-white"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando...
                        </>
                    ) : (
                        <>
                            <Lock className="mr-2 h-4 w-4" /> Pagar ${totalAmount.toFixed(2)}
                        </>
                    )}
                </Button>
                </DialogFooter>
            </>
        )}
      </DialogContent>
    </Dialog>
  );
}