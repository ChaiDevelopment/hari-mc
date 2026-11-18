import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AdminBookingsService } from './admin-bookings.service';
import { AdminOverviewService } from './admin-overview.service';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminBookingsController, AdminCalendarController, AdminCustomersController, AdminDashboardController } from './admin.controllers';

@Module({
  imports: [StorageModule],
  controllers: [AdminDashboardController, AdminBookingsController, AdminCalendarController, AdminCustomersController, AdminSettingsController],
  providers: [AdminBookingsService, AdminOverviewService],
})
export class AdminModule {}
