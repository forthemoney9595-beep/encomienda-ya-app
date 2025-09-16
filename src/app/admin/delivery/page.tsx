import PageHeader from '@/components/page-header';
import { deliveryPersonnel } from '@/lib/placeholder-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function AdminDeliveryPage() {
  return (
    <div className="container mx-auto">
      <PageHeader title="Delivery Management" description="Manage your delivery personnel accounts.">
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add New Driver
        </Button>
      </PageHeader>
      <Card>
        <CardHeader>
          <CardTitle>Delivery Personnel</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead className="hidden md:table-cell">Zone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveryPersonnel.map((driver) => (
                <TableRow key={driver.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={`https://picsum.photos/seed/${driver.id}/40/40`} alt={driver.name} />
                        <AvatarFallback>{driver.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{driver.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{driver.vehicle}</TableCell>
                  <TableCell className="hidden md:table-cell">{driver.zone}</TableCell>
                  <TableCell>
                    <Badge variant={driver.status === 'Active' ? 'secondary' : 'outline'}>{driver.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm">Edit</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
