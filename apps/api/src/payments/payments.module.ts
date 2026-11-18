import { Global, Module } from '@nestjs/common';
import { AdminPaymentsController, CustomerPaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Global()
@Module({ controllers: [CustomerPaymentsController, AdminPaymentsController], providers: [PaymentsService], exports: [PaymentsService] })
export class PaymentsModule {}
