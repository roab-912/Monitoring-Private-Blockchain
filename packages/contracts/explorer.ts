import { Type, type Static } from '@sinclair/typebox';
export const Decimal = Type.String({ pattern: '^(0|[1-9][0-9]{0,77})$' });
export const Hash = Type.String({ pattern: '^0x[0-9a-fA-F]{64}$' });
export const Address = Type.String({ pattern: '^0x[0-9a-fA-F]{40}$' });
export const SourceId = Type.String({ pattern: '^[a-z][a-z0-9-]{0,47}$' });
const nullable = <T extends Parameters<typeof Type.Union>[0][number]>(schema: T) => Type.Union([schema,Type.Null()]);
export const ConnectionRequest = Type.Object({ name:Type.String({minLength:1,maxLength:100}), chainId:Decimal, networkId:Decimal,
  genesisHash:Hash, sourceIds:Type.Array(SourceId,{minItems:1,maxItems:3,uniqueItems:true}) },{additionalProperties:false});
export type ConnectionInput = Static<typeof ConnectionRequest>;
export const SourceOptions = Type.Array(Type.Object({ id:SourceId,label:Type.String() }));
export const NetworkView = Type.Object({ id:Type.String({format:'uuid'}),name:Type.String(),chainId:Decimal,networkId:Decimal,
  genesisHash:Hash,ownership:Type.Union([Type.Literal('managed'),Type.Literal('imported')]),besuVersion:Type.String() });
export const SourceObservation = Type.Object({ sourceId:SourceId,label:Type.String(),version:Type.String(),head:Decimal,
  chainId:Decimal,genesisHash:Hash,observedAt:Type.String(),capabilities:Type.Array(Type.String()) });
export const IndexStatus = Type.Object({ network:nullable(NetworkView),generation:Decimal,sourceIds:Type.Array(SourceId),
  state:Type.String(),nextBlock:Decimal,indexedHeight:nullable(Decimal),indexedHash:nullable(Hash),observedHead:nullable(Decimal),
  lag:nullable(Decimal),lastObservedAt:nullable(Type.String()),lastIndexedAt:nullable(Type.String()),
  heartbeatAt:nullable(Type.String()),observationStale:Type.Boolean(),incidentCode:nullable(Type.String()),incidentHeight:nullable(Decimal),
  observations:Type.Array(SourceObservation),blockCount:Decimal,transactionCount:Decimal,logCount:Decimal });
export type IndexStatusDto = Static<typeof IndexStatus>;
export const PageQuery = Type.Object({ limit:Type.Optional(Type.Integer({minimum:1,maximum:50,default:20})),
  before:Type.Optional(Type.String({pattern:'^[0-9]{1,78}(?::[0-9]{1,10})?$'})) },{additionalProperties:false});
export const BlockView = Type.Object({ networkId:Type.String({format:'uuid'}),height:Decimal,hash:Hash,parentHash:Hash,stateRoot:Hash,miner:Address,
  timestamp:Decimal,gasLimit:Decimal,gasUsed:Decimal,transactionCount:Type.Integer({minimum:0}),sourceIds:Type.Array(SourceId),indexedAt:Type.String() });
export type BlockDto = Static<typeof BlockView>;
export const ReceiptView = Type.Object({ status:Type.Union([Type.Literal('success'),Type.Literal('reverted')]),gasUsed:Decimal,
  cumulativeGasUsed:Decimal,effectiveGasPrice:nullable(Decimal),contractAddress:nullable(Address) });
export const TransactionView = Type.Object({ networkId:Type.String({format:'uuid'}),hash:Hash,blockHeight:Decimal,blockHash:Hash,transactionIndex:Type.Integer({minimum:0}),
  sender:Address,recipient:nullable(Address),valueWei:Decimal,nonce:Decimal,gas:Decimal,gasPrice:nullable(Decimal),input:Type.String(),type:Type.String(),
  kind:Type.Union([Type.Literal('creation'),Type.Literal('transaction')]),receipt:ReceiptView,timestamp:Decimal,
  sourceIds:Type.Array(SourceId),indexedAt:Type.String() });
export type TransactionDto = Static<typeof TransactionView>;
export const LogView = Type.Object({networkId:Type.String({format:'uuid'}),blockHeight:Decimal,logIndex:Decimal,transactionHash:Hash,address:Address,
  topics:Type.Array(Hash),data:Type.String()});
export type LogDto = Static<typeof LogView>;
export const BlockPage = Type.Object({items:Type.Array(BlockView),nextCursor:nullable(Decimal)});
export const TransactionPage = Type.Object({items:Type.Array(TransactionView),nextCursor:nullable(Type.String())});
export const LogPage = Type.Object({items:Type.Array(LogView),nextCursor:nullable(Type.String())});
export const AddressView = Type.Object({networkId:Type.String({format:'uuid'}),address:Address,transactionCount:Decimal,logCount:Decimal,observedContractCreation:Type.Boolean()});
export const SearchResult = Type.Object({kind:Type.Union([Type.Literal('block'),Type.Literal('transaction'),Type.Literal('address'),Type.Literal('not_found')]),value:Type.String()});
