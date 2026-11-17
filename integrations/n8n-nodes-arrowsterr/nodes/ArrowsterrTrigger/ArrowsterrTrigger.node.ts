import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { arrowsterrRequest, EVENT_OPTIONS } from '../Arrowsterr/GenericFunctions';

// Starts a workflow when Arrowsterr sends an event. It adds a webhook when the workflow
// is turned on and removes it when the workflow is turned off.
export class ArrowsterrTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Arrowsterr Trigger',
		name: 'arrowsterrTrigger',
		icon: 'file:arrowsterr.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts the workflow when Arrowsterr sends an event, like a daily result or a visibility alert',
		defaults: { name: 'Arrowsterr Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'arrowsterrApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				options: EVENT_OPTIONS,
				default: 'daily.result',
				required: true,
			},
			{
				displayName: 'Arrowsterr only sends events to https addresses. If your n8n runs on http, put it behind https first.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				const url = this.getNodeWebhookUrl('default');
				const event = this.getNodeParameter('event') as string;
				const res = await arrowsterrRequest.call(this, 'GET', '/webhooks');
				const hooks = (res.webhooks as IDataObject[]) ?? [];
				const hit = hooks.find((h) => h.url === url && h.event === event);
				if (!hit) {
					delete data.webhookId;
					return false;
				}
				data.webhookId = hit.id;
				return true;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				const url = this.getNodeWebhookUrl('default');
				const event = this.getNodeParameter('event') as string;
				const res = await arrowsterrRequest.call(this, 'POST', '/webhooks', {}, { url, event });
				if (!res.id) return false;
				data.webhookId = res.id;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (data.webhookId) {
					try {
						await arrowsterrRequest.call(this, 'DELETE', `/webhooks/${encodeURIComponent(String(data.webhookId))}`);
					} catch {
						return false;
					}
					delete data.webhookId;
				}
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData();
		const event = this.getNodeParameter('event') as string;
		// Skip events this trigger does not listen for.
		if (event !== '*' && body.event && body.event !== event) return {};
		return { workflowData: [this.helpers.returnJsonArray(body)] };
	}
}
