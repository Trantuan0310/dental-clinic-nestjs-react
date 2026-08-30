import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

/**
 * API root — returns a friendly landing page so hitting `/api/v1`
 * directly in a browser doesn't 404. Lists the available resources.
 */
@ApiTags('Health')
@Controller({ path: '', version: '1' })
export class ApiRootController {
  @Get()
  @ApiOperation({
    summary: 'API root discovery',
    description:
      'Returns the list of top-level API resources. Helpful for human navigation and onboarding.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the API index.',
  })
  index() {
    return {
      name: 'Dental Clinic Management API',
      version: '1.0',
      docs: '/api/docs',
      resources: [
        '/api/v1/auth',
        '/api/v1/admin/users',
        '/api/v1/admin/roles',
        '/api/v1/admin/audit-logs',
        '/api/v1/patients',
        '/api/v1/appointments',
        '/api/v1/medical-records',
        '/api/v1/billing',
        '/api/v1/inventory',
        '/api/v1/expenses',
        '/api/v1/payroll',
        '/api/v1/ai',
      ],
    };
  }
}
