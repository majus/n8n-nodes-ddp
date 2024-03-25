// @ts-nocheck
/* eslint-disable n8n-nodes-base/node-filename-against-convention */
import DDPClient from 'simpleddp';
import ws from 'ws';
import {
	ITriggerFunctions,
	INodeType,
	INodeTypeDescription,
	ITriggerResponse,
	IDataObject,
} from 'n8n-workflow';

export class DDPClientNode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'DDP Client',
		name: 'ddpClient',
		group: ['trigger'],
		version: 1,
		description: 'Establishes connection to DDP server',
		defaults: {
			name: 'DDP client',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				required: true,
				default: '',
			},
			{
				displayName: 'Subscriptions',
				name: 'subscriptions',
				type: 'fixedCollection',
				default: [],
				typeOptions: {
					multipleValues: true,
				},
				options: [
					{
						name: 'items',
						displayName: 'Subscription',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								required: true,
							},
						],
					},
				],
			},
			{
				displayName: 'Collections',
				name: 'collections',
				type: 'fixedCollection',
				default: [],
				typeOptions: {
					multipleValues: true,
				},
				options: [
					{
						name: 'items',
						displayName: 'Collection',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								required: true,
							},
						],
					},
				],
			},
		],
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const { name } = this.getNode();
		const subscriptions = this.getNodeParameter('subscriptions', {}) as IDataObject;
		const collections = this.getNodeParameter('collections', {}) as IDataObject;
		const endpoint = new URL(this.getNodeParameter('url') as string);
		endpoint.protocol = 'websocket';
		endpoint.pathname = '/websocket';
		const client = new DDPClient({
			endpoint: endpoint.toString(),
			SocketConstructor: ws,
			reconnectInterval: 5000,
		});
		client.on('connected', () => {
			console.log(`DDP Client "${name}" connected`);
		});
		client.on('disconnected', () => {
			console.log(`DDP Client "${name}" disconnected`);
		});
		client.on('error', (error: Error) => {
			console.log(`DDP Client "${name}" error`, error);
		});
		client.ddpConnection.socket.on('message', (data: any) => {
			console.debug('WebSocket message', data);
		});
		await client.connect();
		// Subscriptions
		const subs = subscriptions.items?.map(({ name }) => client.subscribe(name)) ?? [];
		// Collections
		if (collections.items) {
			for (const { name } of collections.items) {
				client
					.collection(name)
					.reactive()
					.onChange((data) => {
						this.emit([this.helpers.returnJsonArray({ name, data })]);
					});
			}
		}
		return {
			closeFunction: () => client.disconnect(),
			manualTriggerFunction: async () => {
				if (collections.items) {
					// Wait for all subscriptions to be ready
					await Promise.all(subs);
					// Fetch all collections data available
					this.emit([
						this.helpers.returnJsonArray(
							collections.items.map(({ name }) => ({
								name,
								data: client.collection(name).fetch(),
							})),
						),
					]);
				} else {
					return this.emit([]);
				}
			},
		};
	}
}
