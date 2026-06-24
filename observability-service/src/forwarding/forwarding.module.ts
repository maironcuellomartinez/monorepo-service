import { Module } from '@nestjs/common';
import { FORWARDERS, IForwarder } from './forwarder.interface';
import { JaegerForwarder } from './jaeger.forwarder';
import { PrometheusForwarder } from './prometheus.forwarder';

@Module({
    providers: [
        {
            provide: FORWARDERS,
            useFactory: (): IForwarder[] => {
                const forwarders: IForwarder[] = [];
                if (process.env.JAEGER_OTLP_URL) {
                    forwarders.push(new JaegerForwarder(process.env.JAEGER_OTLP_URL));
                }
                if (process.env.PROMETHEUS_PUSHGATEWAY_URL) {
                    forwarders.push(new PrometheusForwarder(process.env.PROMETHEUS_PUSHGATEWAY_URL));
                }
                return forwarders;
            },
        },
    ],
    exports: [FORWARDERS],
})
export class ForwardingModule {}
