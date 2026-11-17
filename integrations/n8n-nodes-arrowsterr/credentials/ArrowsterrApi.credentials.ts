import type { IAuthenticateGeneric, Icon, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

// The Arrowsterr API key, sent in the X-API-Key header on every request.
export class ArrowsterrApi implements ICredentialType {
	name = 'arrowsterrApi';

	displayName = 'Arrowsterr API';

	icon: Icon = 'file:arrowsterr.svg';

	documentationUrl = 'https://app.arrowsterr.com/settings/integrations';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'aw_live_...',
			description: 'Make one in Arrowsterr under Settings, Workspace & members, Integrations, API keys',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://app.arrowsterr.com/api/v1',
			description: 'Leave this as it is unless Arrowsterr support gives you another address',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/me',
		},
	};
}
