/* eslint-disable n8n-nodes-base/node-filename-against-convention */
// @ts-nocheck
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
		// eslint-disable-next-line n8n-nodes-base/node-class-description-icon-not-svg
		icon: 'file:DDPClientNode.png',
		group: ['trigger'],
		version: 1,
		description: 'Establishes connection to DDP server',
		defaults: {
			name: 'DDP client',
		},
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
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
		endpoint.protocol = 'wss';
		endpoint.pathname = '/websocket';
		const client = new DDPClient({
			endpoint: endpoint.toString(),
			SocketConstructor: ws,
			autoConnect: false,
			autoReconnect: false,
		});
		client.on('connected', () => {
			console.info(`"${name}" connected`);
		});
		const reconnector = client.on('disconnected', () => {
			const err = new Error('Connection lost');
			this.emitError(err);
		});
		client.on('error', (err: Error) => {
			this.emitError(err);
		});
		client.ddpConnection.socket.on('message:in', (data: any) => {
			console.debug('WebSocket message', data);
		});
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
		// Initiate connection
		const timeout = setTimeout(() => {
			const err = new Error('Connection timeout');
			this.emitError(err);
		}, 5 * 60 * 1000);
		// Implying that this will never throw error
		client.connect().then(() => clearTimeout(timeout));
		return {
			closeFunction() {
				// Prevent from reconnecting
				reconnector.stop();
				client.disconnect();
			},
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
