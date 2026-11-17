import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { arrowsterrRequest, EVENT_OPTIONS, getBrands } from './GenericFunctions';

const BRAND_RESOURCES = ['calendar', 'competitor', 'prompt', 'topicBank', 'visibility'];

const properties: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Brand', value: 'brand' },
			{ name: 'Competitor', value: 'competitor' },
			{ name: 'Editorial Calendar', value: 'calendar' },
			{ name: 'Prompt', value: 'prompt' },
			{ name: 'Topic Bank', value: 'topicBank' },
			{ name: 'Visibility', value: 'visibility' },
			{ name: 'Webhook', value: 'webhook' },
			{ name: 'Workspace', value: 'workspace' },
		],
		default: 'visibility',
	},

	// Operations, one list per resource.
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['workspace'] } },
		options: [{ name: 'Get', value: 'get', action: 'Get the workspace', description: 'The workspace this API key belongs to' }],
		default: 'get',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['brand'] } },
		options: [{ name: 'Get Many', value: 'getAll', action: 'Get many brands', description: 'Every brand in the workspace' }],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['visibility'] } },
		options: [
			{ name: 'Get by AI Model', value: 'getByModel', action: 'Get visibility by AI model', description: 'Visibility for each AI model, in total or by day' },
			{ name: 'Get Over Time', value: 'getOverTime', action: 'Get visibility over time', description: 'Visibility by day, with the top competitors' },
		],
		default: 'getOverTime',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['competitor'] } },
		options: [{ name: 'Get Many', value: 'getAll', action: 'Get many competitors', description: 'Brands AI names next to yours, with visibility, position and sentiment' }],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['prompt'] } },
		options: [{ name: 'Get Many', value: 'getAll', action: 'Get many prompts', description: 'Tracked prompts, with their topic' }],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['topicBank'] } },
		options: [{ name: 'Get Many', value: 'getAll', action: 'Get many topic bank keywords', description: 'Keywords with volume, difficulty, intent and stage' }],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['calendar'] } },
		options: [{ name: 'Get Many', value: 'getAll', action: 'Get many calendar items', description: 'Editorial Calendar items with status and due date' }],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['webhook'] } },
		options: [
			{ name: 'Create', value: 'create', action: 'Create a webhook', description: 'Send an event to a URL' },
			{ name: 'Delete', value: 'delete', action: 'Delete a webhook', description: 'Stop sending events to a URL' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many webhooks', description: 'Every webhook in the workspace' },
		],
		default: 'getAll',
	},

	// Fields.
	{
		displayName: 'Brand Name or ID',
		name: 'brandId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getBrands' },
		required: true,
		default: '',
		displayOptions: { show: { resource: BRAND_RESOURCES } },
		description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},
	{
		displayName: 'Days',
		name: 'days',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 365 },
		default: 30,
		displayOptions: { show: { resource: ['visibility', 'competitor'] } },
		description: 'How many days back to look',
	},
	{
		displayName: 'View',
		name: 'view',
		type: 'options',
		options: [
			{ name: 'Total per Model', value: 'total' },
			{ name: 'Each Day per Model', value: 'daily' },
		],
		default: 'total',
		displayOptions: { show: { resource: ['visibility'], operation: ['getByModel'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 50 },
		default: 15,
		displayOptions: { show: { resource: ['competitor'] } },
		description: 'Max number of results to return. Your own brand is always included.',
	},
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com/hook',
		displayOptions: { show: { resource: ['webhook'], operation: ['create'] } },
		description: 'Where Arrowsterr sends the event. It must start with https://.',
	},
	{
		displayName: 'Event',
		name: 'event',
		type: 'options',
		options: EVENT_OPTIONS,
		default: 'daily.result',
		displayOptions: { show: { resource: ['webhook'], operation: ['create'] } },
	},
	{
		displayName: 'Webhook ID',
		name: 'webhookId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['webhook'], operation: ['delete'] } },
	},
	{
		displayName: 'Split Into Items',
		name: 'split',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['brand', 'calendar', 'competitor', 'prompt', 'topicBank', 'visibility', 'webhook'] }, hide: { operation: ['create', 'delete'] } },
		description: 'Whether to output one item per row. Turn off to get the full reply as one item.',
	},
];

// Rows to output for each reply, when split into items.
function rowsOf(resource: string, operation: string, res: IDataObject, view: string): IDataObject[] {
	const brand = (res.brand as IDataObject | undefined) ?? {};
	const tag = (rows: IDataObject[]) => rows.map((r) => ({ brand_id: brand.id, brand_name: brand.name, ...r }));
	if (resource === 'brand') return (res.brands as IDataObject[]) ?? [];
	if (resource === 'webhook') return (res.webhooks as IDataObject[]) ?? [];
	if (resource === 'calendar') return (res.items as IDataObject[]) ?? [];
	if (resource === 'topicBank') return ((res.keywords as IDataObject[]) ?? []).map((k) => ({ site: res.site, ...k }));
	if (resource === 'competitor') return tag((res.competitors as IDataObject[]) ?? []);
	if (resource === 'visibility' && operation === 'getOverTime') return tag((res.days as IDataObject[]) ?? []);
	if (resource === 'visibility') return tag(((view === 'daily' ? res.days : res.models) as IDataObject[]) ?? []);
	if (resource === 'prompt') return tag((res.rows as IDataObject[]) ?? []);
	return [res];
}

export class Arrowsterr implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Arrowsterr',
		name: 'arrowsterr',
		icon: 'file:arrowsterr.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Get AI visibility, competitors, prompts, Topic Bank and Editorial Calendar data from Arrowsterr',
		defaults: { name: 'Arrowsterr' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'arrowsterrApi', required: true }],
		properties,
	};

	methods = { loadOptions: { getBrands } };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];
		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const brandId = BRAND_RESOURCES.includes(resource) ? (this.getNodeParameter('brandId', i) as string) : '';
				let res: IDataObject;
				let view = 'total';

				if (resource === 'workspace') {
					res = ((await arrowsterrRequest.call(this, 'GET', '/me')).workspace as IDataObject) ?? {};
				} else if (resource === 'brand') {
					res = await arrowsterrRequest.call(this, 'GET', '/brands');
				} else if (resource === 'visibility') {
					const days = this.getNodeParameter('days', i) as number;
					if (operation === 'getByModel') view = this.getNodeParameter('view', i) as string;
					const path = operation === 'getByModel' ? '/visibility/models' : '/visibility';
					res = await arrowsterrRequest.call(this, 'GET', path, { brand_id: brandId, days });
				} else if (resource === 'competitor') {
					const days = this.getNodeParameter('days', i) as number;
					const limit = this.getNodeParameter('limit', i) as number;
					res = await arrowsterrRequest.call(this, 'GET', '/competitors', { brand_id: brandId, days, limit });
				} else if (resource === 'prompt') {
					res = await arrowsterrRequest.call(this, 'GET', '/prompts', { brand_id: brandId });
				} else if (resource === 'topicBank') {
					res = await arrowsterrRequest.call(this, 'GET', '/topic-bank', { brand_id: brandId });
				} else if (resource === 'calendar') {
					res = await arrowsterrRequest.call(this, 'GET', '/calendar', { brand_id: brandId });
				} else if (resource === 'webhook' && operation === 'create') {
					const url = this.getNodeParameter('url', i) as string;
					const event = this.getNodeParameter('event', i) as string;
					res = await arrowsterrRequest.call(this, 'POST', '/webhooks', {}, { url, event });
				} else if (resource === 'webhook' && operation === 'delete') {
					const id = this.getNodeParameter('webhookId', i) as string;
					res = await arrowsterrRequest.call(this, 'DELETE', `/webhooks/${encodeURIComponent(id)}`);
				} else if (resource === 'webhook') {
					res = await arrowsterrRequest.call(this, 'GET', '/webhooks');
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown resource "${resource}"`, { itemIndex: i });
				}

				const listOp = resource !== 'workspace' && !(resource === 'webhook' && operation !== 'getAll');
				const split = listOp && (this.getNodeParameter('split', i, true) as boolean);
				const rows = split ? rowsOf(resource, operation, res, view) : [res];
				for (const json of rows) out.push({ json, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw error;
			}
		}
		return [out];
	}
}
